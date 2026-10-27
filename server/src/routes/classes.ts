import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { assertOwnsClass } from "../lib/ownership.js";
import { generateUniqueJoinCode } from "../lib/joinCode.js";
import { EDP_TAKEN_MESSAGE, SEMESTERS, isValidSchoolYear, termOf } from "@shared/schoolTerm.js";

export const classesRouter = Router();

const createClassSchema = z.object({
  subjectCode:  z.string().min(1),
  subjectName:  z.string().min(1),
  departmentId: z.number().int().positive(),
  edpCode:      z.string().min(1),
  type:         z.enum(["LECTURE", "LABORATORY"]).default("LECTURE"),
  // The form prefills the current term from today's date; a client that sends none gets the same.
  schoolYear:   z.string().refine(isValidSchoolYear, "Use a school year like 2026-2027.").optional(),
  semester:     z.enum(SEMESTERS).optional(),
});

const idParam = z.coerce.number().int().positive();

// POST /api/classes — create a class section with a generated class-level join code
classesRouter.post("/api/classes", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const result = createClassSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const { subjectCode, subjectName, departmentId, edpCode, type } = result.data;
  const term = { ...termOf(new Date()), ...(result.data.schoolYear ? { schoolYear: result.data.schoolYear } : {}), ...(result.data.semester ? { semester: result.data.semester } : {}) };
  const instructorId = req.user!.sub;

  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    res.status(400).json({ error: "Selected department does not exist." });
    return;
  }

  // Unique per term across all instructors. The answer never says who holds the code.
  const taken = { code: "EDP_TAKEN", error: EDP_TAKEN_MESSAGE };
  if (await prisma.classSection.findFirst({ where: { edpCode, ...term }, select: { id: true } })) {
    res.status(409).json(taken);
    return;
  }

  const joinCode = await generateUniqueJoinCode();

  try {
    const cls = await prisma.classSection.create({
      data: { subjectCode, subjectName, departmentId, edpCode, type, instructorId, joinCode, ...term },
    });
    res.status(201).json(cls);
  } catch (err) {
    // Two requests with the same code at once: the partial unique index decides.
    if ((err as { code?: string }).code === "P2002") {
      res.status(409).json(taken);
      return;
    }
    throw err;
  }
});

// DELETE /api/classes/:id — delete the class and all descendants in dependency order
classesRouter.delete("/api/classes/:id", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid class section id" });
    return;
  }

  const cls = await assertOwnsClass(req, res, idResult.data);
  if (!cls) return;

  await prisma.$transaction(async (tx) => {
    // Delete ClassEnrollment rows (students enrolled in this class)
    await tx.classEnrollment.deleteMany({ where: { classSectionId: cls.id } });

    const assignments = await tx.assignment.findMany({
      where:  { classSectionId: cls.id },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id);

    if (assignmentIds.length) {
      const projects = await tx.project.findMany({
        where:  { assignmentId: { in: assignmentIds } },
        select: { id: true },
      });
      const projectIds = projects.map((p) => p.id);

      if (projectIds.length) {
        await tx.alert.deleteMany({ where: { projectId: { in: projectIds } } });
        await tx.groupMembership.deleteMany({ where: { projectId: { in: projectIds } } });
        await tx.member.deleteMany({ where: { projectId: { in: projectIds } } });
        await tx.report.deleteMany({ where: { projectId: { in: projectIds } } });
        await tx.project.deleteMany({ where: { id: { in: projectIds } } });
      }

      await tx.assignment.deleteMany({ where: { id: { in: assignmentIds } } });
    }

    await tx.classSection.delete({ where: { id: cls.id } });
  });

  res.json({ message: "Class section deleted" });
});

// PATCH /api/classes/:id/ai-review - the owning instructor turns AI work summaries on or off for the
// class. Off: no AI calls for its groups and the summaries are hidden from everyone (stored rows are
// kept, not served). Admins are read-only.
classesRouter.patch("/api/classes/:id/ai-review", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid class section id" });
    return;
  }
  const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "enabled must be true or false" });
    return;
  }
  const cls = await assertOwnsClass(req, res, idResult.data);
  if (!cls) return;
  const updated = await prisma.classSection.update({
    where: { id: cls.id },
    data: { aiReviewEnabled: body.data.enabled },
    select: { id: true, aiReviewEnabled: true },
  });
  res.json(updated);
});

// GET /api/classes — list the instructor's class sections with assignments and group counts
classesRouter.get("/api/classes", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const instructorId = req.user!.sub;

  const classes = await prisma.classSection.findMany({
    where:   { instructorId },
    orderBy: { createdAt: "asc" },
    include: {
      department: { select: { id: true, name: true, code: true } },
      assignments: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { projects: true } } },
      },
    },
  });

  res.json({ classes });
});

// GET /api/classes/:id/assignments — assignments for one class (ownership-verified; ADMIN bypasses ownership)
classesRouter.get("/api/classes/:id/assignments", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid class section id" });
    return;
  }

  const cls = await assertOwnsClass(req, res, idResult.data);
  if (!cls) return;

  const [assignments, department] = await Promise.all([
    prisma.assignment.findMany({
      where:   { classSectionId: cls.id },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { projects: true } } },
    }),
    prisma.department.findUnique({ where: { id: cls.departmentId }, select: { id: true, name: true, code: true } }),
  ]);

  res.json({
    class: {
      id:          cls.id,
      subjectCode: cls.subjectCode,
      subjectName: cls.subjectName,
      department,
      edpCode:     cls.edpCode,
      type:        cls.type,
      joinCode:    cls.joinCode,
      aiReviewEnabled: cls.aiReviewEnabled,
      createdAt:   cls.createdAt,
    },
    assignments,
  });
});

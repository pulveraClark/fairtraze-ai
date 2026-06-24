import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { assertOwnsClass } from "../lib/ownership.js";

export const classesRouter = Router();

const createClassSchema = z.object({
  subjectCode: z.string().min(1),
  subjectName: z.string().min(1),
  course:      z.string().min(1).default("BSIT"),
  edpCode:     z.string().min(1),
  type:        z.enum(["LECTURE", "LABORATORY"]).default("LECTURE"),
});

const idParam = z.coerce.number().int().positive();

// POST /api/classes — create a class section
classesRouter.post("/api/classes", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const result = createClassSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const { subjectCode, subjectName, course, edpCode, type } = result.data;
  const instructorId = req.user!.sub;

  const existing = await prisma.classSection.findUnique({
    where: { instructorId_edpCode: { instructorId, edpCode } },
  });
  if (existing) {
    res.status(409).json({
      error: `EDP code "${edpCode}" is already used by your "${existing.subjectCode} — ${existing.subjectName}" class section. Each of your class sections must have a unique EDP code.`,
    });
    return;
  }

  const cls = await prisma.classSection.create({
    data: { subjectCode, subjectName, course, edpCode, type, instructorId },
  });

  res.status(201).json(cls);
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

// GET /api/classes — list the instructor's class sections with assignments and group counts
classesRouter.get("/api/classes", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const instructorId = req.user!.sub;

  const classes = await prisma.classSection.findMany({
    where:   { instructorId },
    orderBy: { createdAt: "asc" },
    include: {
      assignments: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { projects: true } } },
      },
    },
  });

  res.json({ classes });
});

// GET /api/classes/:id/assignments — assignments for one class (ownership-verified; ADMIN bypasses ownership)
classesRouter.get("/api/classes/:id/assignments", ...requireRole("INSTRUCTOR", "ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid class section id" });
    return;
  }

  const cls = await assertOwnsClass(req, res, idResult.data);
  if (!cls) return;

  const assignments = await prisma.assignment.findMany({
    where:   { classSectionId: cls.id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { projects: true } } },
  });

  res.json({
    class: {
      id:          cls.id,
      subjectCode: cls.subjectCode,
      subjectName: cls.subjectName,
      course:      cls.course,
      edpCode:     cls.edpCode,
      type:        cls.type,
      createdAt:   cls.createdAt,
    },
    assignments,
  });
});

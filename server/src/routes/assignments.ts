import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { assertOwnsClass, assertOwnsAssignment } from "../lib/ownership.js";
import { generateUniqueJoinCode } from "../lib/joinCode.js";
import { BRIEF_DESCRIPTION_MAX, attachmentMetaFor } from "../lib/briefAttachments.js";

export const assignmentsRouter = Router();

const createAssignmentSchema = z.object({
  classSectionId: z.number().int().positive(),
  title:          z.string().min(1),
  deadline:       z.string({ required_error: "Deadline is required" }).datetime({ offset: true, message: "Deadline is required" }),
  maxGroupSize:   z.number().int().positive().default(5),
  sourceType:     z.enum(["GITHUB", "EDITOR", "COMBINED"]),
  description:    z.string().max(BRIEF_DESCRIPTION_MAX, `Description must be ${BRIEF_DESCRIPTION_MAX} characters or fewer`).optional(),
});

// sourceType is deliberately not editable: changing it would invalidate existing groups, roles and reports.
const updateAssignmentSchema = z.object({
  title:        z.string().trim().min(1).optional(),
  deadline:     z.string().datetime({ offset: true }).optional(),
  maxGroupSize: z.number().int().positive().max(20).optional(),
  description:  z.string().max(BRIEF_DESCRIPTION_MAX, `Description must be ${BRIEF_DESCRIPTION_MAX} characters or fewer`).nullable().optional(),
});

/** Plain text only: trim, and store empty as null. Rendering escapes it; nothing here is HTML. */
function normalizeDescription(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

const idParam = z.coerce.number().int().positive();

// POST /api/assignments — create an assignment under an instructor-owned class
assignmentsRouter.post("/api/assignments", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const result = createAssignmentSchema.safeParse(req.body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid input";
    res.status(400).json({ error: message, details: result.error.flatten() });
    return;
  }

  const { classSectionId, title, deadline, maxGroupSize, sourceType, description } = result.data;

  const cls = await assertOwnsClass(req, res, classSectionId);
  if (!cls) return;

  const joinCode = await generateUniqueJoinCode();

  const assignment = await prisma.assignment.create({
    data: {
      classSectionId,
      title,
      deadline:     new Date(deadline),
      maxGroupSize,
      sourceType,
      joinCode,
      description:  normalizeDescription(description),
    },
  });

  res.status(201).json(assignment);
});

// PATCH /api/assignments/:id — edit title/deadline/maxGroupSize/description
assignmentsRouter.patch("/api/assignments/:id", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }
  const parsed = updateAssignmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const assignment = await assertOwnsAssignment(req, res, idResult.data);
  if (!assignment) return;

  const { title, deadline, maxGroupSize, description } = parsed.data;

  if (maxGroupSize !== undefined) {
    const groups = await prisma.project.findMany({
      where:  { assignmentId: assignment.id },
      select: { _count: { select: { members: true, groupMemberships: true } } },
    });
    const largest = groups.reduce((m, g) => Math.max(m, g._count.members, g._count.groupMemberships), 0);
    if (maxGroupSize < largest) {
      res.status(400).json({
        error: `Max group size can't be lower than your largest existing group (${largest} member${largest === 1 ? "" : "s"}).`,
      });
      return;
    }
  }

  const updated = await prisma.assignment.update({
    where: { id: assignment.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(deadline !== undefined ? { deadline: new Date(deadline) } : {}),
      ...(maxGroupSize !== undefined ? { maxGroupSize } : {}),
      ...(description !== undefined ? { description: normalizeDescription(description) } : {}),
    },
  });
  res.json(updated);
});

// DELETE /api/assignments/:id — delete the assignment and all descendants in dependency order
assignmentsRouter.delete("/api/assignments/:id", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }

  const assignment = await assertOwnsAssignment(req, res, idResult.data);
  if (!assignment) return;

  await prisma.$transaction(async (tx) => {
    const projects = await tx.project.findMany({
      where:  { assignmentId: assignment.id },
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

    await tx.assignment.delete({ where: { id: assignment.id } });
  });

  res.json({ message: "Assignment deleted" });
});

// GET /api/assignments/:id — one assignment with its groups (ownership-verified; ADMIN bypasses ownership)
assignmentsRouter.get("/api/assignments/:id", ...requireRole("INSTRUCTOR", "ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }

  const assignment = await assertOwnsAssignment(req, res, idResult.data);
  if (!assignment) return;

  const projects = await prisma.project.findMany({
    where:   { assignmentId: assignment.id },
    orderBy: { id: "asc" },
    include: { members: true, reports: { orderBy: { generatedAt: "desc" }, take: 1 } },
  });
  const attachments = (await attachmentMetaFor([assignment.id])).get(assignment.id) ?? [];

  res.json({
    assignment: {
      id:            assignment.id,
      title:         assignment.title,
      deadline:      assignment.deadline,
      maxGroupSize:  assignment.maxGroupSize,
      sourceType:    assignment.sourceType,
      createdAt:     assignment.createdAt,
      classSectionId: assignment.classSectionId,
      description:   assignment.description,
      attachments,
    },
    groups: projects.map((p) => ({
      id:              p.id,
      groupName:       p.groupName || `Group ${p.id}`,
      repoUrl:         p.repoUrl,
      memberCount:     p.members.length,
      lastAnalyzedAt:  p.reports[0]?.generatedAt.toISOString() ?? null,
      isAnalyzed:      p.reports.length > 0,
    })),
  });
});

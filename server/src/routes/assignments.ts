import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { assertOwnsClass, assertOwnsAssignment } from "../lib/ownership.js";
import { generateUniqueJoinCode } from "../lib/joinCode.js";

export const assignmentsRouter = Router();

const createAssignmentSchema = z.object({
  classSectionId: z.number().int().positive(),
  title:          z.string().min(1),
  deadline:       z.string().datetime({ offset: true }).optional(),
  maxGroupSize:   z.number().int().positive().default(5),
  sourceType:     z.enum(["GITHUB", "EDITOR", "COMBINED"]).default("GITHUB"),
});

const idParam = z.coerce.number().int().positive();

// POST /api/assignments — create an assignment under an instructor-owned class
assignmentsRouter.post("/api/assignments", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const result = createAssignmentSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const { classSectionId, title, deadline, maxGroupSize, sourceType } = result.data;

  const cls = await assertOwnsClass(req, res, classSectionId);
  if (!cls) return;

  const joinCode = await generateUniqueJoinCode();

  const assignment = await prisma.assignment.create({
    data: {
      classSectionId,
      title,
      deadline:     deadline ? new Date(deadline) : null,
      maxGroupSize,
      sourceType,
      joinCode,
    },
  });

  res.status(201).json(assignment);
});

// DELETE /api/assignments/:id — delete the assignment; DB cascades to projects → alerts/reports/members/memberships
assignmentsRouter.delete("/api/assignments/:id", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }

  const assignment = await assertOwnsAssignment(req, res, idResult.data);
  if (!assignment) return;

  await prisma.assignment.delete({ where: { id: assignment.id } });
  res.json({ message: "Assignment deleted" });
});

// GET /api/assignments/:id — one assignment with its groups (ownership-verified)
assignmentsRouter.get("/api/assignments/:id", ...requireRole("INSTRUCTOR"), async (req, res) => {
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

  res.json({
    assignment: {
      id:            assignment.id,
      title:         assignment.title,
      joinCode:      assignment.joinCode,
      deadline:      assignment.deadline,
      maxGroupSize:  assignment.maxGroupSize,
      sourceType:    assignment.sourceType,
      createdAt:     assignment.createdAt,
      classSectionId: assignment.classSectionId,
    },
    groups: projects.map((p) => ({
      id:              p.id,
      groupName:       p.groupName || `Group ${p.id}`,
      name:            p.name,
      repoUrl:         p.repoUrl,
      memberCount:     p.members.length,
      lastAnalyzedAt:  p.reports[0]?.generatedAt.toISOString() ?? null,
      isAnalyzed:      p.reports.length > 0,
    })),
  });
});

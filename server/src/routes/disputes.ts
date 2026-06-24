import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

export const disputesRouter = Router();

const idParam = z.coerce.number().int().positive();

const reasonSchema = z.string().trim().min(1, "Reason is required").max(2000, "Reason must be under 2000 characters");

// ── POST /api/disputes ────────────────────────────────────────────────────────
// Student raises a dispute for their group. Prevents duplicate OPEN disputes.
// After creating the dispute, fires a DISPUTE_FILED alert for the instructor.

disputesRouter.post("/api/disputes", ...requireRole("STUDENT"), async (req, res) => {
  const result = z.object({
    projectId: z.number().int().positive(),
    reason:    reasonSchema,
  }).safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { projectId, reason } = result.data;
  const studentUserId = req.user!.sub;

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_projectId: { userId: studentUserId, projectId } },
  });
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this group." });
    return;
  }

  const existing = await prisma.dispute.findFirst({
    where: { studentUserId, projectId, status: "OPEN" },
  });
  if (existing) {
    res.status(409).json({ error: "You already have an open dispute for this group." });
    return;
  }

  const student = await prisma.user.findUnique({
    where:  { id: studentUserId },
    select: { name: true },
  });

  const dispute = await prisma.dispute.create({
    data: { projectId, studentUserId, memberName: student!.name, reason },
  });

  res.status(201).json(dispute);

  // Fire-and-forget: create a DISPUTE_FILED alert for the instructor.
  // Runs after the response is sent so it never delays the student.
  createDisputeAlert(projectId, student!.name).catch((err) =>
    console.error("[disputes] alert creation failed:", err)
  );
});

async function createDisputeAlert(projectId: number, studentName: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where:   { id: projectId },
    include: {
      assignment: {
        include: { classSection: { select: { instructorId: true, subjectCode: true } } },
      },
      reports: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
  });

  if (!project?.assignment?.classSection) return;

  const { instructorId, subjectCode } = project.assignment.classSection;
  const groupName  = project.groupName || `Group ${projectId}`;
  const teamHealth = (project.reports[0]?.teamHealth as string | null | undefined) ?? "Healthy";

  await prisma.alert.create({
    data: {
      projectId,
      instructorId,
      type:    "DISPUTE_FILED",
      message: `New dispute from ${studentName} — ${groupName}, ${subjectCode}`,
      teamHealth,
      read:    false,
    },
  });
}

// ── GET /api/disputes/mine ────────────────────────────────────────────────────
// Student retrieves all their own disputes (any status), newest first.
// Must be declared before /:id to avoid route shadowing.

disputesRouter.get("/api/disputes/mine", ...requireRole("STUDENT"), async (req, res) => {
  const studentUserId = req.user!.sub;

  const disputes = await prisma.dispute.findMany({
    where:   { studentUserId },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, groupName: true, name: true } },
    },
  });

  res.json({ disputes });
});

// ── GET /api/disputes ─────────────────────────────────────────────────────────
// Instructor sees all disputes for groups in their classes, OPEN first.

disputesRouter.get("/api/disputes", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const instructorId = req.user!.sub;

  const disputes = await prisma.dispute.findMany({
    where: {
      project: {
        assignment: {
          classSection: { instructorId },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      project: {
        select: {
          id:         true,
          groupName:  true,
          name:       true,
          assignment: {
            select: {
              id:    true,
              title: true,
              classSection: {
                select: {
                  id:          true,
                  subjectCode: true,
                  subjectName: true,
                  edpCode:     true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Sort OPEN first, then by createdAt desc
  const sorted = [...disputes].sort((a, b) => {
    if (a.status === "OPEN" && b.status !== "OPEN") return -1;
    if (a.status !== "OPEN" && b.status === "OPEN") return  1;
    return 0;
  });

  const openCount = disputes.filter((d) => d.status === "OPEN").length;

  res.json({ disputes: sorted, openCount });
});

// ── GET /api/projects/:id/disputes ────────────────────────────────────────────
// Instructor fetches OPEN disputes for a specific project (for inline indicators).

disputesRouter.get("/api/projects/:id/disputes", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId    = idResult.data;
  const instructorId = req.user!.sub;

  // Verify instructor owns the project's class
  const project = await prisma.project.findUnique({
    where:   { id: projectId },
    include: { assignment: { include: { classSection: { select: { instructorId: true } } } } },
  });

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.assignment && project.assignment.classSection.instructorId !== instructorId) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }

  const disputes = await prisma.dispute.findMany({
    where:   { projectId, status: "OPEN" },
    select:  { id: true, memberName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({ disputes });
});

// ── POST /api/disputes/:id/resolve ────────────────────────────────────────────
// Instructor resolves or dismisses an OPEN dispute. Ownership-checked.

disputesRouter.post("/api/disputes/:id/resolve", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid dispute id" });
    return;
  }

  const bodyResult = z.object({
    status:             z.enum(["RESOLVED", "DISMISSED"]),
    instructorResponse: z.string().trim().min(1, "Response is required").max(2000, "Response must be under 2000 characters"),
  }).safeParse(req.body);

  if (!bodyResult.success) {
    res.status(400).json({ error: bodyResult.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const dispute = await prisma.dispute.findUnique({
    where:   { id: idResult.data },
    include: {
      project: {
        select: {
          assignment: {
            select: { classSection: { select: { instructorId: true } } },
          },
        },
      },
    },
  });

  if (!dispute) {
    res.status(404).json({ error: "Dispute not found" });
    return;
  }

  if (dispute.project.assignment?.classSection.instructorId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this dispute." });
    return;
  }

  if (dispute.status !== "OPEN") {
    res.status(409).json({ error: "This dispute is already resolved." });
    return;
  }

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status:             bodyResult.data.status,
      instructorResponse: bodyResult.data.instructorResponse,
      resolvedAt:         new Date(),
    },
  });

  res.json(updated);
});

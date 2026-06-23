import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const groupsRouter = Router();

const idParam = z.coerce.number().int().positive();

// ── Shared loader ─────────────────────────────────────────────────────────────
async function loadGroup(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignment: {
        select: {
          maxGroupSize:  true,
          sourceType:    true,
          classSection:  { select: { instructorId: true } },
        },
      },
      groupMemberships: {
        include: {
          user: { select: { id: true, name: true, email: true, githubUsername: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function isInstructorOf(
  req: Request,
  project: NonNullable<Awaited<ReturnType<typeof loadGroup>>>
): boolean {
  return (
    (req.user!.role === "INSTRUCTOR" || req.user!.role === "ADMIN") &&
    project.assignment?.classSection.instructorId === req.user!.sub
  );
}

function leaderMembership(
  req: Request,
  project: NonNullable<Awaited<ReturnType<typeof loadGroup>>>
) {
  return project.groupMemberships.find(
    (m) => m.userId === req.user!.sub && m.role === "LEADER"
  );
}

function canManage(
  req: Request,
  project: NonNullable<Awaited<ReturnType<typeof loadGroup>>>
): boolean {
  return isInstructorOf(req, project) || !!leaderMembership(req, project);
}

// GET /api/groups/:id — group info + member list (requireAuth + member or instructor)
groupsRouter.get("/api/groups/:id", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  const project = await loadGroup(idResult.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  const isMember = project.groupMemberships.some((m) => m.userId === req.user!.sub);
  if (!isMember && !isInstructorOf(req, project)) {
    res.status(403).json({ error: "You do not have access to this group." });
    return;
  }

  res.json({
    id:          project.id,
    groupName:   project.groupName || `Group ${project.id}`,
    name:        project.name,
    repoUrl:     project.repoUrl,
    sourceType:  project.assignment?.sourceType ?? null,
    maxGroupSize: project.assignment?.maxGroupSize ?? null,
    members: project.groupMemberships.map((m) => ({
      userId:         m.user.id,
      name:           m.user.name,
      email:          m.user.email,
      githubUsername: m.user.githubUsername,
      role:           m.role,
      joinedAt:       m.joinedAt.toISOString(),
    })),
  });
});

// POST /api/groups/:id/reassign-leader — demote current leader, promote chosen member
groupsRouter.post("/api/groups/:id/reassign-leader", requireAuth, async (req: Request, res: Response) => {
  const idResult   = idParam.safeParse(req.params.id);
  const bodyResult = z.object({ userId: z.number().int().positive() }).safeParse(req.body);

  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  if (!bodyResult.success) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const project = await loadGroup(idResult.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or the project instructor can reassign leadership." });
    return;
  }

  const targetId = bodyResult.data.userId;
  const target   = project.groupMemberships.find((m) => m.userId === targetId);
  if (!target) {
    res.status(404).json({ error: "That user is not a member of this group." });
    return;
  }
  if (target.role === "LEADER") {
    res.status(400).json({ error: "That member is already the leader." });
    return;
  }

  const currentLeader = project.groupMemberships.find((m) => m.role === "LEADER");

  await prisma.$transaction(async (tx) => {
    if (currentLeader) {
      await tx.groupMembership.update({ where: { id: currentLeader.id }, data: { role: "MEMBER" } });
    }
    await tx.groupMembership.update({ where: { id: target.id }, data: { role: "LEADER" } });
  });

  res.json({ message: "Leadership reassigned.", newLeaderId: targetId });
});

// DELETE /api/groups/:id/members/:userId — remove a member (leader/instructor) or leave (self)
groupsRouter.delete("/api/groups/:id/members/:userId", requireAuth, async (req: Request, res: Response) => {
  const idResult     = idParam.safeParse(req.params.id);
  const targetResult = idParam.safeParse(req.params.userId);

  if (!idResult.success || !targetResult.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const projectId    = idResult.data;
  const targetUserId = targetResult.data;
  const requesterId  = req.user!.sub;

  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  const targetMembership = project.groupMemberships.find((m) => m.userId === targetUserId);
  if (!targetMembership) {
    res.status(404).json({ error: "That user is not a member of this group." });
    return;
  }

  // Authorization: instructor who owns the class, the group's LEADER, or self-remove
  const selfRemove = requesterId === targetUserId;
  if (!selfRemove && !canManage(req, project)) {
    res.status(403).json({ error: "You do not have permission to remove this member." });
    return;
  }

  // Block removing the LEADER — must reassign first
  if (targetMembership.role === "LEADER") {
    if (project.groupMemberships.length <= 1) {
      res.status(409).json({
        error: "You are the only member of this group. Contact your instructor if you need to leave.",
      });
    } else {
      res.status(409).json({
        error: "Reassign leadership to another member before leaving or removing the leader.",
      });
    }
    return;
  }

  await prisma.groupMembership.delete({ where: { id: targetMembership.id } });

  // Remove the corresponding analysis Member row (matched by githubUsername + projectId)
  const targetGitHub = targetMembership.user.githubUsername;
  if (targetGitHub) {
    await prisma.member.deleteMany({
      where: { projectId, githubUsername: targetGitHub },
    });
  }

  res.json({ message: "Member removed." });
});

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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

  const isAdmin  = req.user!.role === "ADMIN";
  const isMember = project.groupMemberships.some((m) => m.userId === req.user!.sub);
  if (!isAdmin && !isMember && !isInstructorOf(req, project)) {
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
      userId:          m.user.id,
      name:            m.user.name,
      email:           m.user.email,
      githubUsername:  m.user.githubUsername,
      role:            m.role,
      functionalRoles: JSON.parse(m.functionalRoles) as string[],
      joinedAt:        m.joinedAt.toISOString(),
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

// PUT /api/groups/:id/members/:userId/functional-roles — directly assign functional role(s).
// Auth: group leader or instructor only (authoritative — no approval step).
// Members must use POST /api/groups/:id/role-suggestions for self-suggestion.
// Roles add context only — they never change scores, flags, Gini, or team health.
groupsRouter.put("/api/groups/:id/members/:userId/functional-roles", requireAuth, async (req: Request, res: Response) => {
  const idResult     = idParam.safeParse(req.params.id);
  const targetResult = idParam.safeParse(req.params.userId);
  if (!idResult.success || !targetResult.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const bodyResult = z.object({
    functionalRoles: z.array(z.enum(["DEVELOPER", "DOCUMENTATION"])).max(2),
  }).safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "functionalRoles must be an array of valid roles: DEVELOPER, DOCUMENTATION" });
    return;
  }

  const projectId    = idResult.data;
  const targetUserId = targetResult.data;

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

  // Auth: leader or instructor only — members use the suggestion endpoint
  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can assign roles directly. Members may suggest a role using the suggestion flow." });
    return;
  }

  const functionalRoles = [...new Set(bodyResult.data.functionalRoles)];

  // Auto-decline any pending suggestion from that member since the leader/instructor is overriding directly
  await prisma.roleSuggestion.updateMany({
    where: { userId: targetUserId, projectId, status: "PENDING" },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  });

  await prisma.groupMembership.update({
    where: { id: targetMembership.id },
    data:  { functionalRoles: JSON.stringify(functionalRoles) },
  });

  res.json({ userId: targetUserId, functionalRoles });
});

// POST /api/groups/:id/role-suggestions — member suggests a functional role for themselves.
// Creates a PENDING request the leader must accept or decline. Does NOT change the member's role.
groupsRouter.post("/api/groups/:id/role-suggestions", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid group id" }); return; }

  const bodyResult = z.object({
    suggestedRoles: z.array(z.enum(["DEVELOPER", "DOCUMENTATION"])).min(1).max(2),
  }).safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "suggestedRoles must be a non-empty array: DEVELOPER, DOCUMENTATION" });
    return;
  }

  const projectId   = idResult.data;
  const requesterId = req.user!.sub;

  const project = await loadGroup(projectId);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  const myMembership = project.groupMemberships.find((m) => m.userId === requesterId);
  if (!myMembership) {
    res.status(403).json({ error: "You are not a member of this group." });
    return;
  }

  // Leaders and instructors assign directly — they don't go through the suggestion flow
  if (myMembership.role === "LEADER" || isInstructorOf(req, project)) {
    res.status(400).json({ error: "Leaders and instructors assign roles directly — no suggestion needed." });
    return;
  }

  // Validate roles against the assignment's sourceType
  const sourceType = project.assignment?.sourceType ?? "GITHUB";
  const suggested  = [...new Set(bodyResult.data.suggestedRoles)];
  for (const role of suggested) {
    if (sourceType === "GITHUB" && role !== "DEVELOPER") {
      res.status(400).json({ error: "GitHub assignments only support the Developer role." });
      return;
    }
    if (sourceType === "EDITOR" && role !== "DOCUMENTATION") {
      res.status(400).json({ error: "Editor assignments only support the Documentation role." });
      return;
    }
  }

  // Cancel any existing PENDING suggestion before creating a new one
  await prisma.roleSuggestion.updateMany({
    where: { userId: requesterId, projectId, status: "PENDING" },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  });

  const suggestion = await prisma.roleSuggestion.create({
    data: {
      userId:         requesterId,
      projectId,
      suggestedRoles: JSON.stringify(suggested),
      status:         "PENDING",
    },
  });

  res.status(201).json({
    id:             suggestion.id,
    suggestedRoles: suggested,
    status:         "PENDING",
    createdAt:      suggestion.createdAt.toISOString(),
  });
});

// GET /api/groups/:id/role-suggestions — list PENDING role suggestions (leader or instructor)
groupsRouter.get("/api/groups/:id/role-suggestions", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid group id" }); return; }

  const project = await loadGroup(idResult.data);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can view role suggestions." });
    return;
  }

  const suggestions = await prisma.roleSuggestion.findMany({
    where:   { projectId: idResult.data, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  res.json({
    suggestions: suggestions.map((s) => ({
      id:             s.id,
      user:           { id: s.user.id, name: s.user.name, email: s.user.email },
      suggestedRoles: JSON.parse(s.suggestedRoles) as string[],
      status:         s.status,
      createdAt:      s.createdAt.toISOString(),
    })),
  });
});

// POST /api/groups/role-suggestions/:id/accept — accept a role suggestion (leader or instructor)
// Applies the suggested roles to the member's GroupMembership.
groupsRouter.post("/api/groups/role-suggestions/:id/accept", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid suggestion id" }); return; }

  const suggestion = await prisma.roleSuggestion.findUnique({ where: { id: idResult.data } });
  if (!suggestion) { res.status(404).json({ error: "Suggestion not found." }); return; }
  if (suggestion.status !== "PENDING") {
    res.status(409).json({ error: "This suggestion has already been resolved." });
    return;
  }

  const project = await loadGroup(suggestion.projectId);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can accept role suggestions." });
    return;
  }

  const targetMembership = project.groupMemberships.find((m) => m.userId === suggestion.userId);
  if (!targetMembership) {
    res.status(404).json({ error: "Member is no longer in this group." });
    return;
  }

  await prisma.$transaction([
    prisma.groupMembership.update({
      where: { id: targetMembership.id },
      data:  { functionalRoles: suggestion.suggestedRoles },
    }),
    prisma.roleSuggestion.update({
      where: { id: suggestion.id },
      data:  { status: "ACCEPTED", resolvedAt: new Date() },
    }),
  ]);

  res.json({
    message:        "Role suggestion accepted.",
    functionalRoles: JSON.parse(suggestion.suggestedRoles) as string[],
  });
});

// POST /api/groups/role-suggestions/:id/decline — decline a role suggestion (leader or instructor)
groupsRouter.post("/api/groups/role-suggestions/:id/decline", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid suggestion id" }); return; }

  const suggestion = await prisma.roleSuggestion.findUnique({ where: { id: idResult.data } });
  if (!suggestion) { res.status(404).json({ error: "Suggestion not found." }); return; }
  if (suggestion.status !== "PENDING") {
    res.status(409).json({ error: "This suggestion has already been resolved." });
    return;
  }

  const project = await loadGroup(suggestion.projectId);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can decline role suggestions." });
    return;
  }

  await prisma.roleSuggestion.update({
    where: { id: suggestion.id },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  });

  res.json({ message: "Role suggestion declined." });
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

  // Handle LEADER removal — must reassign first unless they are the sole member
  if (targetMembership.role === "LEADER") {
    if (project.groupMemberships.length <= 1) {
      // Sole member — disband the group (cascade deletes memberships, reports, etc.)
      await prisma.project.delete({ where: { id: projectId } });
      res.json({ message: "Group disbanded.", disbanded: true });
      return;
    } else {
      res.status(409).json({
        error: "Reassign leadership to another member before leaving or removing the leader.",
      });
      return;
    }
  }

  await prisma.$transaction([
    prisma.groupMembership.delete({ where: { id: targetMembership.id } }),
    prisma.project.update({
      where: { id: projectId },
      data:  { membershipChangedAt: new Date() },
    }),
  ]);

  // Remove the corresponding analysis Member row (matched by githubUsername + projectId)
  const targetGitHub = targetMembership.user.githubUsername;
  if (targetGitHub) {
    await prisma.member.deleteMany({
      where: { projectId, githubUsername: targetGitHub },
    });
  }

  res.json({ message: "Member removed." });
});

// ── Join-request flow ──────────────────────────────────────────────────────────

// POST /api/groups/:projectId/request — student requests to join a group
groupsRouter.post("/api/groups/:projectId/request", ...requireRole("STUDENT"), async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.projectId);
  if (!idResult.success) { res.status(400).json({ error: "Invalid group id" }); return; }

  const userId    = req.user!.sub;
  const projectId = idResult.data;

  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        assignment: {
          select: { id: true, maxGroupSize: true, sourceType: true, classSectionId: true },
        },
        members: { select: { id: true } },
      },
    }),
  ]);

  if (!project?.assignmentId || !project.assignment) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  // Must be enrolled in the class
  const enrollment = await prisma.classEnrollment.findUnique({
    where: { userId_classSectionId: { userId, classSectionId: project.assignment.classSectionId } },
  });
  if (!enrollment) {
    res.status(403).json({ error: "You must be enrolled in this class to request to join a group." });
    return;
  }

  // GitHub username required for GitHub / Combined assignments
  const needsGitHub = project.assignment.sourceType === "GITHUB" || project.assignment.sourceType === "COMBINED";
  if (needsGitHub && !user?.githubUsername) {
    res.status(400).json({ error: "Set your GitHub username in Settings before requesting to join this group." });
    return;
  }

  // Already a member of a group in this assignment?
  const alreadyIn = await prisma.groupMembership.findFirst({
    where: { userId, project: { assignmentId: project.assignmentId } },
  });
  if (alreadyIn) {
    res.status(409).json({ error: "You are already in a group for this project." });
    return;
  }

  // Already have a PENDING request for any group in this assignment?
  const pendingExists = await prisma.groupJoinRequest.findFirst({
    where: {
      userId,
      status: "PENDING",
      project: { assignmentId: project.assignmentId },
    },
  });
  if (pendingExists) {
    res.status(409).json({
      error: "You already have a pending request for this project. Wait for a response before requesting another group.",
    });
    return;
  }

  // Block if group is already full
  if (project.members.length >= project.assignment.maxGroupSize) {
    res.status(409).json({ error: "This group is full." });
    return;
  }

  const joinRequest = await prisma.groupJoinRequest.create({
    data: { userId, projectId, status: "PENDING" },
  });

  res.status(201).json({
    id:        joinRequest.id,
    projectId: project.id,
    groupName: project.groupName || `Group ${project.id}`,
    status:    "PENDING",
    createdAt: joinRequest.createdAt.toISOString(),
  });
});

// GET /api/groups/:projectId/requests — list PENDING requests (leader or instructor)
groupsRouter.get("/api/groups/:projectId/requests", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.projectId);
  if (!idResult.success) { res.status(400).json({ error: "Invalid group id" }); return; }

  const project = await loadGroup(idResult.data);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can view join requests." });
    return;
  }

  const requests = await prisma.groupJoinRequest.findMany({
    where:   { projectId: idResult.data, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, githubUsername: true } },
    },
  });

  res.json({
    requests: requests.map((r) => ({
      id:      r.id,
      student: {
        id:             r.user.id,
        name:           r.user.name,
        email:          r.user.email,
        githubUsername: r.user.githubUsername,
      },
      status:    r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// POST /api/groups/requests/:id/accept — accept a join request (leader or instructor)
groupsRouter.post("/api/groups/requests/:id/accept", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid request id" }); return; }

  const joinReq = await prisma.groupJoinRequest.findUnique({
    where:   { id: idResult.data },
    include: { user: { select: { id: true, name: true, githubUsername: true } } },
  });
  if (!joinReq) { res.status(404).json({ error: "Request not found." }); return; }
  if (joinReq.status !== "PENDING") {
    res.status(409).json({ error: "This request has already been resolved." });
    return;
  }

  const project = await loadGroup(joinReq.projectId);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can accept join requests." });
    return;
  }

  if (project.groupMemberships.length >= (project.assignment?.maxGroupSize ?? Infinity)) {
    res.status(409).json({ error: "This group is full. Cannot accept the request." });
    return;
  }

  await prisma.$transaction([
    prisma.groupMembership.create({
      data: { userId: joinReq.userId, projectId: joinReq.projectId, role: "MEMBER" },
    }),
    prisma.project.update({
      where: { id: joinReq.projectId },
      data:  { membershipChangedAt: new Date() },
    }),
    prisma.groupJoinRequest.update({
      where: { id: joinReq.id },
      data:  { status: "ACCEPTED", resolvedAt: new Date() },
    }),
  ]);

  await prisma.member.create({
    data: {
      projectId:      joinReq.projectId,
      studentName:    joinReq.user.name,
      githubUsername: joinReq.user.githubUsername ?? "",
    },
  });

  res.json({ message: "Request accepted. Member added to the group." });
});

// POST /api/groups/requests/:id/decline — decline a join request (leader or instructor)
groupsRouter.post("/api/groups/requests/:id/decline", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid request id" }); return; }

  const joinReq = await prisma.groupJoinRequest.findUnique({
    where: { id: idResult.data },
  });
  if (!joinReq) { res.status(404).json({ error: "Request not found." }); return; }
  if (joinReq.status !== "PENDING") {
    res.status(409).json({ error: "This request has already been resolved." });
    return;
  }

  const project = await loadGroup(joinReq.projectId);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can decline join requests." });
    return;
  }

  await prisma.groupJoinRequest.update({
    where: { id: joinReq.id },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  });

  res.json({ message: "Request declined." });
});

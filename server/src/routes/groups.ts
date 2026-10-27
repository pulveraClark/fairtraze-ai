import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { defaultFunctionalRoles } from "../lib/roles.js";
import { notify, resolveNotifications } from "../lib/notify.js";
import { loadGroup, isInstructorOf, canManage } from "../lib/groupAccess.js";
import { checkRepoUrl, sameRepo } from "@shared/repoUrl.js";
import { checkRepoReachable } from "../lib/githubRepoCheck.js";
import { REPO_CHANGED_ACTION } from "../lib/repoChange.js";

export const groupsRouter = Router();

const idParam = z.coerce.number().int().positive();

// loadGroup / isInstructorOf / leaderMembership / canManage live in lib/groupAccess.ts; re-exported
// so existing importers (documents.ts) keep working.
export { loadGroup, isInstructorOf, leaderMembership } from "../lib/groupAccess.js";

function groupLabel(project: { id: number; groupName: string }): string {
  return project.groupName.trim() || `Group ${project.id}`;
}

// Declines a member's PENDING role suggestion(s) (a newer suggestion or a direct leader/instructor
// assignment supersedes them) and clears the leader's now-stale "role suggestion received"
// notifications. Reading the ids is best-effort so it can never fail the calling route.
async function supersedePendingSuggestions(userId: number, projectId: number): Promise<void> {
  let ids: number[] = [];
  try {
    const pending = await prisma.roleSuggestion.findMany({
      where:  { userId, projectId, status: "PENDING" },
      select: { id: true },
    });
    ids = pending.map((p) => p.id);
  } catch (err) {
    console.error("[notify] failed to load pending role suggestions:", err);
  }
  await prisma.roleSuggestion.updateMany({
    where: { userId, projectId, status: "PENDING" },
    data:  { status: "DECLINED", resolvedAt: new Date() },
  });
  for (const refId of ids) {
    await resolveNotifications({ type: "ROLE_SUGGESTION_RECEIVED", refType: "ROLE_SUGGESTION", refId });
  }
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

  const seesEmails = isInstructorOf(req, project);

  res.json({
    id:          project.id,
    groupName:   project.groupName || `Group ${project.id}`,
    repoUrl:     project.repoUrl,
    sourceType:  project.assignment?.sourceType ?? null,
    maxGroupSize: project.assignment?.maxGroupSize ?? null,
    members: project.groupMemberships.map((m) => ({
      userId:          m.user.id,
      name:            m.user.name,
      // Email is for the owning instructor only; teammates see display names and GitHub usernames.
      ...(seesEmails ? { email: m.user.email } : {}),
      githubUsername:  m.user.githubUsername,
      role:            m.role,
      functionalRoles: JSON.parse(m.functionalRoles) as string[],
      joinedAt:        m.joinedAt.toISOString(),
    })),
  });
});

// What to tell the student when the repository check fails; each ends with the one thing to do next.
const REPO_NOT_FOUND_MESSAGE =
  "We couldn't find that repository, or it is private. Make the repository public, or ask your instructor how to share it.";

// PUT /api/groups/:id/repo — link or change the group's GitHub repository.
// Any member may add the FIRST link; once one is linked only the leader may change it. The instructor
// is view-only. Every link/change is audit-logged and tells the rest of the group. A change after a
// report exists marks that report outdated through the existing membershipChangedAt marker.
groupsRouter.put("/api/groups/:id/repo", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid group id" }); return; }

  const project = await loadGroup(idResult.data);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  const userId = req.user!.sub;
  const membership = project.groupMemberships.find((m) => m.userId === userId);
  if (!membership) {
    res.status(403).json({ error: "Only members of this group can link its repository." });
    return;
  }
  if (project.assignment?.sourceType === "EDITOR") {
    res.status(400).json({ error: "This project uses FairTraze Docs only, so its groups have no GitHub repository." });
    return;
  }
  if (project.repoUrl && membership.role !== "LEADER") {
    res.status(403).json({ error: "Only the group leader can change the repository once it is linked." });
    return;
  }

  const body = z.object({ repoUrl: z.string() }).safeParse(req.body);
  const checked = checkRepoUrl(body.success ? body.data.repoUrl : "");
  if (!checked.ok) { res.status(400).json({ code: "REPO_FORMAT", error: checked.message }); return; }

  // Same repository again: nothing to save, nothing to log, no report marked outdated.
  if (sameRepo(project.repoUrl, checked.url)) { res.json({ repoUrl: project.repoUrl, changed: false }); return; }

  const reach = await checkRepoReachable(checked.owner, checked.repo, process.env.GITHUB_TOKEN);
  if (reach.status === "not-found") { res.status(422).json({ code: "REPO_NOT_FOUND", error: REPO_NOT_FOUND_MESSAGE }); return; }
  if (reach.status === "rate-limited") { res.status(429).json({ code: "REPO_CHECK_BUSY", error: "GitHub is busy right now. Wait a minute, then try again." }); return; }
  if (reach.status === "no-token") { res.status(503).json({ code: "REPO_CHECK_UNAVAILABLE", error: "Repository checks are not available right now. Try again later, or ask your instructor." }); return; }
  if (reach.status === "unreachable") { res.status(502).json({ code: "REPO_CHECK_FAILED", error: "We couldn't reach GitHub. Check your connection and try again." }); return; }

  const previous = project.repoUrl;
  const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const hasReport = !!previous && (await prisma.report.count({ where: { projectId: project.id } })) > 0;

  await prisma.project.update({
    where: { id: project.id },
    data: { repoUrl: checked.url, ...(hasReport ? { membershipChangedAt: new Date() } : {}) },
  });
  await prisma.auditLog.create({
    data: {
      actorId:    userId,
      actorName:  actor?.name ?? `User ${userId}`,
      action:     previous ? REPO_CHANGED_ACTION : "GROUP_REPO_LINKED",
      targetType: "GROUP",
      targetId:   String(project.id),
      details:    previous ? `${previous} -> ${checked.url}` : checked.url,
    },
  });

  const label = groupLabel(project);
  const who = actor?.name ?? "A member";
  const message = previous
    ? `${who} changed the GitHub repository of ${label}`
    : `${who} linked the GitHub repository of ${label}`;
  const common = { actorId: userId, type: "GROUP_REPO_CHANGED" as const, message, projectId: project.id, refType: "GROUP_REPO", refId: project.id, collapse: true };
  await notify({ ...common, recipientIds: project.groupMemberships.map((m) => m.userId), link: `/student/group/${project.id}` });
  // The instructor hears about a change, not about the first link; their link opens the instructor page.
  if (previous && project.assignment) {
    await notify({ ...common, recipientIds: project.assignment.classSection.instructorId, link: `/project/${project.id}` });
  }

  res.json({ repoUrl: checked.url, changed: true });
});

// GET /api/groups/:id/setup — what the "Set up your group" card needs, for members only.
// Display only. Unlinked members are named by display name; their username and email are never sent
// (GET /api/groups/:id already shows members to each other, but this card needs nothing more).
groupsRouter.get("/api/groups/:id/setup", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid group id" }); return; }

  const project = await loadGroup(idResult.data);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  const me = project.groupMemberships.find((m) => m.userId === req.user!.sub);
  if (!me) { res.status(403).json({ error: "Only members of this group can see its setup." }); return; }

  // Docs-only groups never need a repository or GitHub usernames.
  const needsRepo = project.assignment?.sourceType !== "EDITOR";
  const repoLinked = !!project.repoUrl;
  const isLeader = me.role === "LEADER";
  const unlinked = project.groupMemberships.filter((m) => !m.user.githubUsername?.trim());

  res.json({
    needsRepo,
    repoUrl: project.repoUrl,
    repoLinked,
    isLeader,
    canLinkRepo: needsRepo && !repoLinked,
    canChangeRepo: needsRepo && repoLinked && isLeader,
    viewerHasGithubUsername: !!me.user.githubUsername?.trim(),
    usernames: {
      linked: project.groupMemberships.length - unlinked.length,
      total: project.groupMemberships.length,
      missingNames: unlinked.map((m) => m.user.name),
    },
  });
});

// PATCH /api/groups/:id — rename the group (leader or instructor only)
groupsRouter.patch("/api/groups/:id", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }

  const bodyResult = z.object({ groupName: z.string().min(1) }).safeParse(req.body);
  const trimmed = bodyResult.success ? bodyResult.data.groupName.trim() : "";
  if (!bodyResult.success || !trimmed) {
    res.status(400).json({ error: "Group name is required." });
    return;
  }

  const project = await loadGroup(idResult.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can rename the group." });
    return;
  }

  if (project.assignmentId) {
    const nameTaken = await prisma.project.findFirst({
      where: { assignmentId: project.assignmentId, groupName: trimmed, NOT: { id: project.id } },
    });
    if (nameTaken) {
      res.status(409).json({ error: "That group name is already taken. Choose a different name." });
      return;
    }
  }

  const updated = await prisma.project.update({
    where: { id: idResult.data },
    data:  { groupName: trimmed },
  });

  res.json({ id: updated.id, groupName: updated.groupName });
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

  const label = groupLabel(project);
  await notify({
    recipientIds: targetId,
    actorId:      req.user!.sub,
    type:         "LEADER_CHANGED",
    message:      `You are now the leader of ${label}`,
    link:         `/student/group/${project.id}`,
    projectId:    project.id,
  });
  if (currentLeader) {
    await notify({
      recipientIds: currentLeader.userId,
      actorId:      req.user!.sub,
      type:         "LEADER_CHANGED",
      message:      `Leadership of ${label} was reassigned`,
      link:         `/student/group/${project.id}`,
      projectId:    project.id,
    });
  }

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

  if (functionalRoles.length === 0) {
    res.status(400).json({ error: "At least one functional role is required" });
    return;
  }

  // Auto-decline any pending suggestion from that member since the leader/instructor is overriding directly
  await supersedePendingSuggestions(targetUserId, projectId);

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
  await supersedePendingSuggestions(requesterId, projectId);

  const suggestion = await prisma.roleSuggestion.create({
    data: {
      userId:         requesterId,
      projectId,
      suggestedRoles: JSON.stringify(suggested),
      status:         "PENDING",
    },
  });

  await notify({
    recipientIds: () => {
      const leader = project.groupMemberships.find((m) => m.role === "LEADER");
      return leader ? [leader.userId] : [];
    },
    actorId:   requesterId,
    type:      "ROLE_SUGGESTION_RECEIVED",
    message:   `${myMembership.user.name} suggested a role in ${groupLabel(project)}`,
    link:      `/student/group/${projectId}?manage=1`,
    projectId,
    refType:   "ROLE_SUGGESTION",
    refId:     suggestion.id,
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

  await resolveNotifications({ type: "ROLE_SUGGESTION_RECEIVED", refType: "ROLE_SUGGESTION", refId: suggestion.id });
  await notify({
    recipientIds: suggestion.userId,
    actorId:      req.user!.sub,
    type:         "ROLE_SUGGESTION_RESOLVED",
    message:      `Your role suggestion in ${groupLabel(project)} was accepted`,
    link:         `/student/group/${project.id}`,
    projectId:    project.id,
  });

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

  await resolveNotifications({ type: "ROLE_SUGGESTION_RECEIVED", refType: "ROLE_SUGGESTION", refId: suggestion.id });
  await notify({
    recipientIds: suggestion.userId,
    actorId:      req.user!.sub,
    type:         "ROLE_SUGGESTION_RESOLVED",
    message:      `Your role suggestion in ${groupLabel(project)} was declined`,
    link:         `/student/group/${project.id}`,
    projectId:    project.id,
  });

  res.json({ message: "Role suggestion declined." });
});

// Tasks live in routes/tasks.ts.

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

  if (selfRemove) {
    // The leader can't self-leave (blocked above), so the leader is always a different user.
    await notify({
      recipientIds: () => {
        const leader = project.groupMemberships.find((m) => m.role === "LEADER");
        return leader ? [leader.userId] : [];
      },
      actorId:   requesterId,
      type:      "MEMBER_REMOVED",
      message:   `${targetMembership.user.name} left ${groupLabel(project)}`,
      link:      `/student/group/${projectId}`,
      projectId,
    });
  } else {
    await notify({
      recipientIds: targetUserId,
      actorId:      requesterId,
      type:         "MEMBER_REMOVED",
      message:      `You were removed from ${groupLabel(project)}`,
      link:         project.assignment ? `/student/class/${project.assignment.classSectionId}` : "/student",
    });
  }

  res.json({ message: "Member removed." });
});

// ── Join-request flow ──────────────────────────────────────────────────────────

// POST /api/groups/:projectId/request — student requests to join a group
groupsRouter.post("/api/groups/:projectId/request", ...requireRole("STUDENT"), requireVerifiedEmail, async (req: Request, res: Response) => {
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

  // Already a member of a group in this assignment?
  const alreadyIn = await prisma.groupMembership.findFirst({
    where: { userId, project: { assignmentId: project.assignmentId } },
  });
  if (alreadyIn) {
    res.status(409).json({ error: "You are already in a group for this project." });
    return;
  }

  // Check-then-create runs under a per-(user, assignment) advisory lock, so two quick clicks (or two tabs)
  // cannot both pass the duplicate check. A repeat request for the same group returns the one that exists.
  const assignmentId = project.assignmentId;
  const maxGroupSize = project.assignment.maxGroupSize;
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${assignmentId}::int)`;

    const pending = await tx.groupJoinRequest.findFirst({
      where:   { userId, status: "PENDING", project: { assignmentId } },
      orderBy: { id: "asc" },
    });
    if (pending?.projectId === projectId) return { kind: "existing" as const, request: pending };
    if (pending) return { kind: "other-group" as const };

    if (project.members.length >= maxGroupSize) return { kind: "full" as const };

    const created = await tx.groupJoinRequest.create({ data: { userId, projectId, status: "PENDING" } });
    return { kind: "created" as const, request: created };
  });

  if (outcome.kind === "other-group") {
    res.status(409).json({
      error: "You already have a pending request for this project. Wait for a response before requesting another group.",
    });
    return;
  }
  if (outcome.kind === "full") {
    res.status(409).json({ error: "This group is full." });
    return;
  }

  const joinRequest = outcome.request;
  if (outcome.kind === "existing") {
    res.status(200).json({
      id:        joinRequest.id,
      projectId: project.id,
      groupName: project.groupName || `Group ${project.id}`,
      status:    "PENDING",
      createdAt: joinRequest.createdAt.toISOString(),
      existing:  true,
    });
    return;
  }

  // Tell the group's leader — the message carries only the requester's name.
  await notify({
    recipientIds: async () => {
      const leaders = await prisma.groupMembership.findMany({
        where: { projectId, role: "LEADER" },
        select: { userId: true },
      });
      return leaders.map((l) => l.userId);
    },
    actorId:      userId,
    type:         "JOIN_REQUEST_RECEIVED",
    message:      `${user?.name ?? "A student"} requested to join ${project.groupName || `Group ${project.id}`}`,
    link:         `/student/group/${project.id}?manage=1`,
    projectId:    project.id,
    refType:      "JOIN_REQUEST",
    refId:        joinRequest.id,
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

type PendingJoinRequest = {
  id: number;
  userId: number;
  projectId: number;
  user: { id: number; name: string; githubUsername: string | null };
};

/**
 * Adds the requester to the group and resolves the request. The one place join-request acceptance happens,
 * so the single "Accept" and "Accept all" follow identical rules. The caller has already checked permission,
 * that the request is PENDING, and that the group has room.
 */
async function acceptJoinRequest(
  joinReq: PendingJoinRequest,
  project: NonNullable<Awaited<ReturnType<typeof loadGroup>>>,
  actorId: number,
): Promise<void> {
  await prisma.$transaction([
    prisma.groupMembership.create({
      data: {
        userId:          joinReq.userId,
        projectId:       joinReq.projectId,
        role:            "MEMBER",
        functionalRoles: defaultFunctionalRoles(project.assignment?.sourceType),
      },
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

  await resolveNotifications({ type: "JOIN_REQUEST_RECEIVED", refType: "JOIN_REQUEST", refId: joinReq.id });
  await notify({
    recipientIds: joinReq.userId,
    actorId,
    type:         "JOIN_REQUEST_ACCEPTED",
    message:      `Your request to join ${project.groupName || `Group ${project.id}`} was accepted`,
    link:         `/student/group/${project.id}`,
    projectId:    project.id,
  });
}

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

  await acceptJoinRequest(joinReq, project, req.user!.sub);

  res.json({ message: "Request accepted. Member added to the group." });
});

// POST /api/groups/:projectId/requests/accept-all — accept every pending request that fits (leader or instructor).
// Oldest first, up to the group's member limit; the rest stay pending. Returns how many were accepted / left.
groupsRouter.post("/api/groups/:projectId/requests/accept-all", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.projectId);
  if (!idResult.success) { res.status(400).json({ error: "Invalid group id" }); return; }

  const project = await loadGroup(idResult.data);
  if (!project) { res.status(404).json({ error: "Group not found." }); return; }

  if (!canManage(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can accept join requests." });
    return;
  }

  const pending = await prisma.groupJoinRequest.findMany({
    where:   { projectId: project.id, status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: { user: { select: { id: true, name: true, githubUsername: true } } },
  });
  if (pending.length === 0) {
    res.status(409).json({ error: "There are no pending requests." });
    return;
  }

  const max = project.assignment?.maxGroupSize ?? Infinity;
  let members = project.groupMemberships.length;
  if (members >= max) {
    res.status(409).json({ error: "This group is full. Cannot accept the requests." });
    return;
  }

  let accepted = 0;
  for (const joinReq of pending) {
    if (members >= max) break;
    await acceptJoinRequest(joinReq, project, req.user!.sub);
    members += 1;
    accepted += 1;
  }

  res.json({ accepted, skipped: pending.length - accepted });
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

  await resolveNotifications({ type: "JOIN_REQUEST_RECEIVED", refType: "JOIN_REQUEST", refId: joinReq.id });
  const classSectionId = project.assignment?.classSectionId;
  await notify({
    recipientIds: joinReq.userId,
    actorId:      req.user!.sub,
    type:         "JOIN_REQUEST_DECLINED",
    message:      `Your request to join ${project.groupName || `Group ${project.id}`} was declined`,
    link:         classSectionId ? `/student/class/${classSectionId}` : "/student",
    projectId:    project.id,
  });

  res.json({ message: "Request declined." });
});

// POST /api/groups/requests/:id/cancel — requester withdraws their own pending request
groupsRouter.post("/api/groups/requests/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid request id" }); return; }

  const joinReq = await prisma.groupJoinRequest.findUnique({
    where: { id: idResult.data },
  });
  if (!joinReq) { res.status(404).json({ error: "Request not found." }); return; }

  if (joinReq.userId !== req.user!.sub) {
    res.status(403).json({ error: "You can only cancel your own request." });
    return;
  }
  if (joinReq.status !== "PENDING") {
    res.status(409).json({ error: "This request has already been resolved." });
    return;
  }

  await prisma.groupJoinRequest.delete({ where: { id: joinReq.id } });

  // The request is gone — remove the leader's pending notification so it never points at nothing.
  await resolveNotifications({ type: "JOIN_REQUEST_RECEIVED", refType: "JOIN_REQUEST", refId: joinReq.id });

  res.json({ message: "Request cancelled." });
});

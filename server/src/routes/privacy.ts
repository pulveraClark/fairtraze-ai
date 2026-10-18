import { Router } from "express";
import { z } from "zod";
import { PRIVACY_NOTICE_VERSION } from "@shared/privacyNotice.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { notify, activeAdminIds } from "../lib/notify.js";

// Data-subject rights under RA 10173: consent record, export (access/portability) and the
// erasure request. Erasure itself is performed by an admin (admin.ts) via lib/anonymizeUser.ts.
export const privacyRouter = Router();

const consentSchema = z.object({ version: z.string().min(1) });
const deletionSchema = z.object({ reason: z.string().trim().max(1000).optional() });

// POST /api/privacy/consent — record acceptance of the CURRENT notice version.
privacyRouter.post("/api/privacy/consent", requireAuth, async (req, res) => {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  if (parsed.data.version !== PRIVACY_NOTICE_VERSION) {
    res.status(409).json({
      error: "The Privacy Notice was updated. Reload the page and review the latest version.",
      code:  "NOTICE_VERSION_MISMATCH",
      currentVersion: PRIVACY_NOTICE_VERSION,
    });
    return;
  }
  const user = await prisma.user.update({
    where: { id: req.user!.sub },
    data:  { consentVersion: PRIVACY_NOTICE_VERSION, consentAcceptedAt: new Date() },
    select: { consentVersion: true, consentAcceptedAt: true },
  });
  res.json({ consentVersion: user.consentVersion, consentAcceptedAt: user.consentAcceptedAt, consentRequired: false });
});

// GET /api/privacy/export — the caller's own data only, as a JSON download.
privacyRouter.get("/api/privacy/export", requireAuth, async (req, res) => {
  const userId = req.user!.sub;

  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id: true, email: true, name: true, systemRole: true, githubUsername: true,
      emailVerified: true, createdAt: true, avatarUpdatedAt: true,
      consentVersion: true, consentAcceptedAt: true, instructorStatus: true,
    },
  });
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  const [
    enrollments, memberships, joinRequests, roleSuggestions, tasks, disputes, alerts,
    comments, sessions, events, auditEntries, deletionRequests, taskComments, taskAttachments,
    taskWatches, taskActivityMine, taskMentionComments, taskMentionDescriptions, taskCommits,
  ] = await Promise.all([
    prisma.classEnrollment.findMany({
      where: { userId },
      select: { joinedAt: true, classSection: { select: { subjectCode: true, subjectName: true } } },
    }),
    prisma.groupMembership.findMany({
      where: { userId },
      select: {
        role: true, functionalRoles: true, joinedAt: true, projectId: true,
        project: {
          select: {
            groupName: true,
            assignment: { select: { title: true, sourceType: true } },
            reports: { orderBy: { generatedAt: "desc" }, take: 1, select: { generatedAt: true, gini: true, teamHealth: true, content: true } },
          },
        },
      },
    }),
    prisma.groupJoinRequest.findMany({ where: { userId }, select: { projectId: true, status: true, createdAt: true, resolvedAt: true } }),
    prisma.roleSuggestion.findMany({ where: { userId }, select: { projectId: true, suggestedRoles: true, status: true, createdAt: true, resolvedAt: true } }),
    prisma.task.findMany({
      where:  { OR: [{ assignedToUserId: userId }, { createdByUserId: userId }] },
      select: {
        id: true, projectId: true, number: true, title: true, description: true, done: true, completedAt: true, createdAt: true,
        assignedToUserId: true, createdByUserId: true, status: true, priority: true, dueDate: true,
        milestone: { select: { name: true } },
        labelLinks: { select: { label: { select: { name: true } } } },
      },
    }),
    prisma.dispute.findMany({
      where:  { studentUserId: userId },
      select: { id: true, projectId: true, reason: true, status: true, instructorResponse: true, disputedFlags: true, createdAt: true, resolvedAt: true },
    }),
    prisma.alert.findMany({
      where:  { OR: [{ recipientId: userId }, { instructorId: userId }] },
      select: { type: true, message: true, link: true, read: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.comment.findMany({
      where:  { authorId: userId },
      select: { id: true, documentId: true, text: true, parentId: true, resolvedAt: true, createdAt: true },
    }),
    prisma.editSession.findMany({
      where:  { userId },
      select: { document: { select: { groupId: true } }, startedAt: true, endedAt: true, characterCount: true, imageInsertCount: true, source: true },
      orderBy: { startedAt: "asc" },
    }),
    prisma.editEvent.groupBy({
      by: ["eventType"],
      where: { userId },
      _count: { _all: true },
      _sum:   { length: true },
    }),
    prisma.auditLog.findMany({
      where:  { actorId: userId },
      select: { action: true, targetType: true, targetId: true, details: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.deletionRequest.findMany({
      where:  { userId },
      select: { status: true, reason: true, createdAt: true, reviewedAt: true },
    }),
    prisma.taskComment.findMany({
      where:  { authorId: userId },
      select: { id: true, taskId: true, body: true, createdAt: true, editedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    // Metadata only: the file bytes are not part of the export.
    prisma.taskAttachment.findMany({
      where:  { createdById: userId },
      select: { id: true, taskId: true, projectId: true, kind: true, filename: true, size: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskWatcher.findMany({ where: { userId }, select: { taskId: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    // History entries hold ids and values only (never display names).
    prisma.taskActivity.findMany({
      where: { actorId: userId },
      select: { taskId: true, type: true, data: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    // Messages addressed to you with @mention: the text others wrote to you (their identity is not included).
    prisma.taskComment.findMany({
      where: { body: { contains: `<@${userId}>` }, NOT: { authorId: userId } },
      select: { id: true, taskId: true, body: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.task.findMany({
      where: { description: { contains: `<@${userId}>` }, NOT: { createdByUserId: userId } },
      select: { id: true, projectId: true, description: true },
    }),
    // Commits in your group's repo that name a task and carry your GitHub login.
    user.githubUsername
      ? prisma.taskCommitLink.findMany({
          where: { authorLogin: { equals: user.githubUsername, mode: "insensitive" } },
          select: { taskId: true, repo: true, sha: true, message: true, committedAt: true },
          orderBy: { committedAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // The caller's OWN entry from each group's latest stored report. Same matching rule as the
  // student group route: userId where reports carry one (EDITOR/COMBINED), else GitHub username.
  const myLogin = user.githubUsername;
  const groups = memberships.map((m) => {
    const latest = m.project.reports[0];
    let myEntry: unknown = null;
    if (latest?.content) {
      try {
        const stored = JSON.parse(latest.content) as { report?: { members?: Array<Record<string, unknown>> } };
        myEntry = (stored.report?.members ?? []).find((mem) =>
          mem.userId === userId || (myLogin && mem.githubUsername === myLogin),
        ) ?? null;
      } catch { /* malformed stored report: omit */ }
    }
    return {
      projectId:       m.projectId,
      groupName:       m.project.groupName,
      assignment:      m.project.assignment ? { title: m.project.assignment.title, sourceType: m.project.assignment.sourceType } : null,
      role:            m.role,
      functionalRoles: safeJson(m.functionalRoles),
      joinedAt:        m.joinedAt,
      latestReport:    latest ? { generatedAt: latest.generatedAt, teamHealth: latest.teamHealth, myContribution: myEntry } : null,
    };
  });

  const payload = {
    exportedAt:    new Date().toISOString(),
    noticeVersion: PRIVACY_NOTICE_VERSION,
    note:          "This file contains only your own personal data. Other members' data is never included.",
    profile:       { ...user, avatarOnFile: user.avatarUpdatedAt !== null },
    classEnrollments: enrollments.map((e) => ({ joinedAt: e.joinedAt, subjectCode: e.classSection.subjectCode, subjectName: e.classSection.subjectName })),
    groups,
    joinRequests,
    roleSuggestions: roleSuggestions.map((r) => ({ ...r, suggestedRoles: safeJson(r.suggestedRoles) })),
    editorActivity: {
      sessions: sessions.map((s) => ({
        projectId: s.document.groupId, startedAt: s.startedAt, endedAt: s.endedAt,
        characterCount: s.characterCount, imageInsertCount: s.imageInsertCount, source: s.source,
      })),
      eventTotals: events.map((e) => ({ eventType: e.eventType, count: e._count._all, totalLength: e._sum.length ?? 0 })),
    },
    tasks: tasks.map(({ milestone, labelLinks, dueDate, ...t }) => ({
      ...t,
      dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      milestone: milestone?.name ?? null,
      labels: labelLinks.map((l) => l.label.name),
    })),
    taskComments,
    taskAttachments,
    taskWatches,
    taskActivityByYou: taskActivityMine,
    taskMentionsOfMe: {
      inComments: taskMentionComments,
      inDescriptions: taskMentionDescriptions.map((t) => ({ taskId: t.id, projectId: t.projectId, text: t.description })),
    },
    taskCommitLinks: taskCommits,
    disputes,
    comments,
    alerts,
    auditEntriesByYou: auditEntries,
    deletionRequests,
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="fairtraze-my-data-${userId}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

// GET /api/privacy/deletion-request — the caller's latest request (or null).
privacyRouter.get("/api/privacy/deletion-request", requireAuth, async (req, res) => {
  const latest = await prisma.deletionRequest.findFirst({
    where:   { userId: req.user!.sub },
    orderBy: { createdAt: "desc" },
    select:  { id: true, status: true, createdAt: true, reviewedAt: true, reviewNote: true },
  });
  res.json({ request: latest });
});

// POST /api/privacy/deletion-request — ask for erasure; an admin reviews it.
privacyRouter.post("/api/privacy/deletion-request", requireAuth, async (req, res) => {
  const parsed = deletionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const userId = req.user!.sub;

  const pending = await prisma.deletionRequest.findFirst({ where: { userId, status: "PENDING" }, select: { id: true } });
  if (pending) {
    res.status(409).json({ error: "You already have a pending deletion request." });
    return;
  }

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const created = await prisma.deletionRequest.create({
    data:   { userId, reason: parsed.data.reason || null },
    select: { id: true, status: true, createdAt: true },
  });

  await notify({
    recipientIds: activeAdminIds,
    actorId:      userId,
    type:         "DELETION_REQUESTED",
    message:      `Account deletion requested by ${me?.name ?? `user #${userId}`}`,
    link:         "/admin?section=deletion-requests",
    refType:      "DELETION_REQUEST",
    refId:        created.id,
  });

  res.status(201).json({ request: created });
});

// DELETE /api/privacy/deletion-request — withdraw your own pending request.
privacyRouter.delete("/api/privacy/deletion-request", requireAuth, async (req, res) => {
  const result = await prisma.deletionRequest.updateMany({
    where: { userId: req.user!.sub, status: "PENDING" },
    data:  { status: "CANCELLED", reviewedAt: new Date() },
  });
  if (result.count === 0) {
    res.status(404).json({ error: "No pending request to cancel." });
    return;
  }
  res.json({ cancelled: true });
});

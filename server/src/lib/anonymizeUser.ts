import { randomBytes } from "crypto";
import { FORMER_MEMBER_NAME } from "@shared/privacyNotice.js";
import { prisma } from "./prisma.js";

// Erasure (RA 10173) by anonymization. The User row is kept as a scrubbed tombstone so every FK
// (edit events, contributions, tasks, comments, memberships) and every userId inside stored
// reports keeps resolving: teammates' scores, shares, flags and Gini are never recomputed or
// changed. Only identifying strings are removed. Never touches shared/ scoring.

export type AnonymizeBlock = "LEADER" | "INSTRUCTOR_HAS_CLASSES" | "NOT_FOUND";

export type AnonymizeResult =
  | { ok: true }
  | { ok: false; code: AnonymizeBlock; message: string };

export interface Identity {
  name:           string;
  email:          string;
  githubUsername: string | null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces the user's name, email and (3+ char) GitHub username in free text.
export function scrubIdentity(text: string, id: Identity, replacement = FORMER_MEMBER_NAME): string {
  const terms = [id.email, id.name, id.githubUsername ?? ""]
    .map((t) => t.trim())
    .filter((t, i) => (i === 2 ? t.length >= 3 : t.length >= 2));
  if (terms.length === 0) return text;
  const alternatives = [...new Set(terms)].sort((a, b) => b.length - a.length).map(escapeRe);
  return text.replace(new RegExp(`(?<![\\w])(?:${alternatives.join("|")})(?![\\w])`, "gi"), replacement);
}

// Rewrites a stored Report.content JSON string: every member object belonging to the user
// (by userId, or by GitHub username) loses its name/username, and the narrative loses them too.
// Numbers, shares, flags and ids are left exactly as they were.
export function scrubReportContent(content: string, userId: number, id: Identity): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  const login = (id.githubUsername ?? "").trim().toLowerCase();

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const isUser =
      obj.userId === userId ||
      (login !== "" && typeof obj.githubUsername === "string" && obj.githubUsername.trim().toLowerCase() === login);
    if (isUser) {
      if ("studentName" in obj) obj.studentName = FORMER_MEMBER_NAME;
      if ("githubUsername" in obj) obj.githubUsername = "";
    }
    for (const v of Object.values(obj)) walk(v);
  };
  walk(parsed);

  const root = parsed as { narrative?: unknown };
  if (root && typeof root === "object" && typeof root.narrative === "string") {
    root.narrative = scrubIdentity(root.narrative, id);
  }
  return JSON.stringify(parsed);
}

export async function anonymizeUser(
  userId: number,
  audit: { actorId: number; actorName: string; action: string },
): Promise<AnonymizeResult> {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, name: true, email: true, githubUsername: true, systemRole: true, deletedAt: true },
  });
  if (!user) return { ok: false, code: "NOT_FOUND", message: "User not found" };

  const [leaderOf, ownedClasses] = await Promise.all([
    prisma.groupMembership.count({ where: { userId, role: "LEADER" } }),
    prisma.classSection.count({ where: { instructorId: userId } }),
  ]);
  if (leaderOf > 0) {
    return { ok: false, code: "LEADER", message: "This user is a group leader. Reassign leadership first." };
  }
  if (ownedClasses > 0) {
    return {
      ok: false,
      code: "INSTRUCTOR_HAS_CLASSES",
      message: "This instructor still owns class sections. Delete or reassign them first.",
    };
  }

  const id: Identity = { name: user.name, email: user.email, githubUsername: user.githubUsername };

  await prisma.$transaction(
    async (tx) => {
      const memberships = await tx.groupMembership.findMany({ where: { userId }, select: { projectId: true } });
      const projectIds = memberships.map((m) => m.projectId);

      // 1. Stored reports of the user's groups: strip identity, keep every number.
      if (projectIds.length > 0) {
        const reports = await tx.report.findMany({
          where:  { projectId: { in: projectIds }, content: { not: null } },
          select: { id: true, content: true },
        });
        for (const r of reports) {
          if (!r.content) continue;
          const next = scrubReportContent(r.content, userId, id);
          if (next !== r.content) await tx.report.update({ where: { id: r.id }, data: { content: next } });
        }

        // 2. Legacy per-group roster rows (no userId column): match by username or name.
        const login = (user.githubUsername ?? "").trim();
        await tx.member.updateMany({
          where: {
            projectId: { in: projectIds },
            OR: [
              ...(login ? [{ githubUsername: { equals: login, mode: "insensitive" as const } }] : []),
              { studentName: { equals: user.name, mode: "insensitive" as const } },
            ],
          },
          data: { studentName: FORMER_MEMBER_NAME, githubUsername: "" },
        });
      }

      // 3. Free-text copies of the identity elsewhere (audit details, alert messages).
      const needles = [user.email, user.name, ...(user.githubUsername && user.githubUsername.length >= 3 ? [user.githubUsername] : [])]
        .filter((t) => t.trim().length >= 2);
      const containsAny = (field: "details" | "message") =>
        needles.map((n) => ({ [field]: { contains: n, mode: "insensitive" as const } }));

      const logs = await tx.auditLog.findMany({
        where:  { OR: [{ actorId: userId }, ...containsAny("details")] },
        select: { id: true, actorId: true, details: true },
      });
      for (const l of logs) {
        await tx.auditLog.update({
          where: { id: l.id },
          data: {
            ...(l.actorId === userId ? { actorName: FORMER_MEMBER_NAME } : {}),
            ...(l.details ? { details: scrubIdentity(l.details, id) } : {}),
          },
        });
      }

      const alerts = await tx.alert.findMany({
        where:  { OR: containsAny("message") },
        select: { id: true, message: true },
      });
      for (const a of alerts) {
        await tx.alert.update({ where: { id: a.id }, data: { message: scrubIdentity(a.message, id) } });
      }

      // 3b. Task comments the user wrote keep their text (so threads still read) minus the identity.
      const taskComments = await tx.taskComment.findMany({ where: { authorId: userId }, select: { id: true, body: true } });
      for (const c of taskComments) {
        const next = scrubIdentity(c.body, id);
        if (next !== c.body) await tx.taskComment.update({ where: { id: c.id }, data: { body: next } });
      }

      // 3c. Task data (phase 8). Free text and file names lose the person's identity; everything stays attached
      //     to the tombstone user, so no task, comment, count or score changes. Attachment bytes are KEPT: the
      //     files are the group's work and removing them would damage teammates' tasks (the privacy notice says so).
      if (projectIds.length > 0) {
        const insensitive = "insensitive" as const;
        const like = (field: string) => needles.map((n) => ({ [field]: { contains: n, mode: insensitive } }));
        const inMyGroups = { task: { projectId: { in: projectIds } } };
        const login = (user.githubUsername ?? "").trim();

        const tasks = await tx.task.findMany({
          where: { projectId: { in: projectIds }, OR: [{ createdByUserId: userId }, ...like("title"), ...like("description")] },
          select: { id: true, title: true, description: true },
        });
        for (const t of tasks) {
          const title = scrubIdentity(t.title, id);
          const description = t.description ? scrubIdentity(t.description, id) : t.description;
          if (title !== t.title || description !== t.description) await tx.task.update({ where: { id: t.id }, data: { title, description } });
        }

        const groupComments = await tx.taskComment.findMany({ where: { ...inMyGroups, OR: like("body") }, select: { id: true, body: true } });
        for (const c of groupComments) {
          const next = scrubIdentity(c.body, id);
          if (next !== c.body) await tx.taskComment.update({ where: { id: c.id }, data: { body: next } });
        }

        const subtasks = await tx.taskSubtask.findMany({ where: { ...inMyGroups, OR: like("title") }, select: { id: true, title: true } });
        for (const s of subtasks) {
          const next = scrubIdentity(s.title, id);
          if (next !== s.title) await tx.taskSubtask.update({ where: { id: s.id }, data: { title: next } });
        }

        const files = await tx.taskAttachment.findMany({
          where: { projectId: { in: projectIds }, OR: [{ createdById: userId }, ...like("filename")] },
          select: { id: true, filename: true },
        });
        for (const f of files) {
          const next = scrubIdentity(f.filename, id);
          if (next !== f.filename) await tx.taskAttachment.update({ where: { id: f.id }, data: { filename: next } });
        }

        const links = await tx.taskCommitLink.findMany({
          where: { ...inMyGroups, OR: [...(login ? [{ authorLogin: { equals: login, mode: insensitive } }] : []), ...like("message")] },
          select: { id: true, message: true, authorLogin: true },
        });
        for (const l of links) {
          const mine = !!login && !!l.authorLogin && l.authorLogin.toLowerCase() === login.toLowerCase();
          await tx.taskCommitLink.update({ where: { id: l.id }, data: { message: scrubIdentity(l.message, id), ...(mine ? { authorLogin: null } : {}) } });
        }

        // History keeps ids and values; the few free-text values (subtask titles, file names, commit author) are scrubbed.
        const activity = await tx.taskActivity.findMany({
          where: { ...inMyGroups, type: { in: ["subtask_added", "subtask_done", "subtask_reopened", "subtask_removed", "attachment_added", "attachment_removed", "commit_linked"] } },
          select: { id: true, data: true },
        });
        for (const a of activity) {
          if (a.data === null || typeof a.data !== "object" || Array.isArray(a.data)) continue;
          const before = JSON.stringify(a.data);
          const data = JSON.parse(before) as Record<string, unknown>;
          for (const [k, v] of Object.entries(data)) {
            if (typeof v !== "string") continue;
            if (k === "authorLogin" && login && v.toLowerCase() === login.toLowerCase()) data[k] = null;
            else if (k === "title" || k === "filename") data[k] = scrubIdentity(v, id);
          }
          if (JSON.stringify(data) !== before) await tx.taskActivity.update({ where: { id: a.id }, data: { data: data as never } });
        }
      }

      // 3c. AI review: the user's own summary is removed from their groups' stored reviews, and their
      // GitHub login is cleared from per-commit digests. Nothing else (scores, other members) changes.
      if (projectIds.length > 0) {
        const aiLogin = (user.githubUsername ?? "").trim();
        if (aiLogin) {
          await tx.aiCommitDigest.updateMany({
            where: { projectId: { in: projectIds }, authorLogin: { equals: aiLogin, mode: "insensitive" } },
            data: { authorLogin: null },
          });
        }
        const aiReviews = await tx.aiReportReview.findMany({
          where: { kind: "MEMBER_SUMMARIES", report: { projectId: { in: projectIds } } },
          select: { id: true, content: true },
        });
        for (const r of aiReviews) {
          const c = r.content as { members?: Array<{ userId: number }>; aiAddressed?: Array<{ userId: number }> };
          const members = (c.members ?? []).filter((m) => m.userId !== userId);
          const aiAddressed = (c.aiAddressed ?? []).filter((a) => a.userId !== userId);
          if (members.length !== (c.members ?? []).length || aiAddressed.length !== (c.aiAddressed ?? []).length) {
            await tx.aiReportReview.update({ where: { id: r.id }, data: { content: { ...c, members, aiAddressed } as never } });
          }
        }
      }

      // 3d. "We have this" marks: the person's note and screenshot are removed; the mark itself stays so the
      // group's check keeps its history.
      await tx.requirementMark.updateMany({ where: { markedById: userId }, data: { note: null, imageData: null, imageMime: null } });

      // 4. Personal rows that have no value once the account is gone.
      await tx.taskNotificationLog.deleteMany({ where: { userId } });
      await tx.taskWatcher.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.emailVerificationToken.deleteMany({ where: { userId } });
      await tx.alert.deleteMany({ where: { OR: [{ recipientId: userId }, { instructorId: userId }] } });
      await tx.groupJoinRequest.deleteMany({ where: { userId } });
      await tx.roleSuggestion.deleteMany({ where: { userId } });
      await tx.dispute.deleteMany({ where: { studentUserId: userId } });
      await tx.classEnrollment.deleteMany({ where: { userId } });
      await tx.deletionRequest.updateMany({ where: { userId }, data: { reason: null } });

      // 5. Tombstone. The password hash is random non-bcrypt text, so no password can ever match.
      await tx.user.update({
        where: { id: userId },
        data: {
          email:               `deleted-${userId}@deleted.invalid`,
          name:                FORMER_MEMBER_NAME,
          passwordHash:        `erased:${randomBytes(24).toString("hex")}`,
          githubUsername:      null,
          avatarData:          null,
          avatarMime:          null,
          avatarUpdatedAt:     null,
          active:              false,
          emailVerified:       false,
          failedLoginAttempts: 0,
          lockedUntil:         null,
          consentVersion:      null,
          consentAcceptedAt:   null,
          deletedAt:           new Date(),
        },
      });

      // 6. Record what happened (id, action, time, who) without the person's name or email.
      await tx.auditLog.create({
        data: {
          actorId:    audit.actorId,
          actorName:  audit.actorName,
          action:     audit.action,
          targetType: "USER",
          targetId:   String(userId),
          details:    `Account #${userId} anonymized`,
        },
      });
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  return { ok: true };
}

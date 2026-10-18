import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  TASK_LIMITS, extractMentionIds,
  type TaskActivityEntry, type TaskActivityType, type TaskDetails,
} from "@shared/taskTypes.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { canCommentOnTask, canEditTask, canWatchTask } from "../lib/taskPermissions.js";
import { logActivity, type TaskRow } from "../lib/taskBoard.js";
import { kindForMime, sanitizeFilename, sniffBriefMime } from "../lib/briefAttachments.js";
import { addWatchers, notifyComment, notifyMentions } from "../lib/taskWatchers.js";
import { commitUrl } from "../lib/taskCommitLinks.js";
import { VIEW_ONLY, idParam, isMemberOf, mentionError, openGroup, openTask, type Ctx } from "./tasks.js";

// Task details (phase 4): subtasks, attachments, comments, watchers and the History feed for one task.
// Planning data only: nothing here is read by scoring. Reads are open to everyone who can see the
// board (the owning instructor and admins get a read-only view); writes need group membership and
// the permission noted on each route. Authorization lives in lib/taskPermissions.ts.

export const taskDetailsRouter = Router();

const base = "/api/groups/:id/tasks/:taskId";

function forbidEdit(res: Response, ctx: Ctx, task: TaskRow, what: string): boolean {
  if (canEditTask(ctx.actor, task)) return false;
  res.status(403).json({ error: `Only the assigned member or the group leader can ${what} (and only until the task is Done).` });
  return true;
}

// ── Details payload ───────────────────────────────────────────────────────────

async function storageUsed(projectId: number): Promise<number> {
  const agg = await prisma.taskAttachment.aggregate({ where: { projectId }, _sum: { size: true } });
  return agg._sum.size ?? 0;
}

async function loadDetails(ctx: Ctx, task: TaskRow): Promise<TaskDetails> {
  const [subtasks, attachments, comments, watchers, activity, used, commitRows] = await Promise.all([
    prisma.taskSubtask.findMany({ where: { taskId: task.id }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
    prisma.taskAttachment.findMany({
      where: { taskId: task.id },
      orderBy: { id: "asc" },
      select: { id: true, kind: true, mime: true, filename: true, size: true, createdById: true, createdAt: true },
    }),
    prisma.taskComment.findMany({ where: { taskId: task.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.taskWatcher.findMany({ where: { taskId: task.id }, select: { userId: true } }),
    prisma.taskActivity.findMany({ where: { taskId: task.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: TASK_LIMITS.historyEntries }),
    storageUsed(ctx.groupId),
    prisma.taskCommitLink.findMany({ where: { taskId: task.id }, orderBy: [{ committedAt: "desc" }, { id: "desc" }], take: TASK_LIMITS.commitsShown }),
  ]);
  const members = new Set(ctx.project.groupMemberships.map((m) => m.userId));
  const watcherIds = watchers.map((w) => w.userId).filter((id) => members.has(id)).sort((a, b) => a - b);
  return {
    taskId: task.id,
    subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done, position: s.position })),
    attachments: attachments.map((a) => ({
      id: a.id, kind: a.kind, mime: a.mime, filename: a.filename, size: a.size,
      createdByUserId: a.createdById, createdAt: a.createdAt.toISOString(),
    })),
    storage: { usedBytes: used, limitBytes: TASK_LIMITS.storagePerGroupBytes },
    comments: comments.map((c) => ({
      id: c.id, authorId: c.authorId, body: c.body, createdAt: c.createdAt.toISOString(),
      editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    })),
    watchers: watcherIds,
    watching: watcherIds.includes(ctx.actor.userId),
    commits: commitRows.map((c) => ({
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message: c.message,
      authorLogin: c.authorLogin,
      committedAt: c.committedAt.toISOString(),
      url: commitUrl(c.repo, c.sha),
    })),
    activity: activity.map((a): TaskActivityEntry => ({
      id: a.id, actorId: a.actorId, type: a.type as TaskActivityType,
      data: (a.data as Record<string, unknown> | null) ?? null, createdAt: a.createdAt.toISOString(),
    })),
  };
}

// GET /api/groups/:id/tasks/:taskId/details — weak ETag from Express, so an unchanged poll is a 304.
taskDetailsRouter.get(`${base}/details`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res);
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  res.set("Cache-Control", "private, no-cache");
  res.vary("Authorization");
  res.json(await loadDetails(ctx, task));
});

// ── Subtasks ──────────────────────────────────────────────────────────────────

const subtaskTitle = z.string().trim().min(1).max(TASK_LIMITS.subtaskTitle);

taskDetailsRouter.post(`${base}/subtasks`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (forbidEdit(res, ctx, task, "add subtasks")) return;
  const body = z.object({ title: subtaskTitle }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: `A subtask needs a title (max ${TASK_LIMITS.subtaskTitle} characters).` }); return; }

  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.taskSubtask.findMany({ where: { taskId: task.id }, select: { position: true } });
    if (existing.length >= TASK_LIMITS.subtasksPerTask) return null;
    const position = existing.reduce((m, s) => Math.max(m, s.position), 0) + 1024;
    const row = await tx.taskSubtask.create({ data: { taskId: task.id, title: body.data.title, position } });
    await logActivity(tx, [{ taskId: task.id, actorId: ctx.actor.userId, type: "subtask_added", data: { title: row.title } }]);
    return row;
  });
  if (!created) { res.status(409).json({ error: `A task can have at most ${TASK_LIMITS.subtasksPerTask} subtasks.` }); return; }
  res.status(201).json({ id: created.id, title: created.title, done: created.done, position: created.position });
});

async function openSubtask(req: Request, res: Response, task: TaskRow) {
  const sid = idParam.safeParse(req.params.subtaskId);
  if (!sid.success) { res.status(400).json({ error: "Invalid subtask id" }); return null; }
  const sub = await prisma.taskSubtask.findUnique({ where: { id: sid.data } });
  if (!sub || sub.taskId !== task.id) { res.status(404).json({ error: "Subtask not found." }); return null; }
  return sub;
}

// Register the fixed "order" path before the :subtaskId routes so it is never read as an id.
taskDetailsRouter.put(`${base}/subtasks/order`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (forbidEdit(res, ctx, task, "reorder subtasks")) return;
  const body = z.object({ ids: z.array(idParam).max(TASK_LIMITS.subtasksPerTask) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid request." }); return; }
  const current = await prisma.taskSubtask.findMany({ where: { taskId: task.id }, select: { id: true } });
  const ids = body.data.ids;
  const have = new Set(current.map((c) => c.id));
  if (ids.length !== have.size || new Set(ids).size !== ids.length || !ids.every((i) => have.has(i))) {
    res.status(400).json({ error: "ids must list every subtask exactly once." });
    return;
  }
  await prisma.$transaction(ids.map((id, i) => prisma.taskSubtask.update({ where: { id }, data: { position: (i + 1) * 1024 } })));
  res.json({ ok: true });
});

taskDetailsRouter.patch(`${base}/subtasks/:subtaskId`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (forbidEdit(res, ctx, task, "change subtasks")) return;
  const sub = await openSubtask(req, res, task);
  if (!sub) return;
  const body = z.object({ title: subtaskTitle.optional(), done: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid subtask." }); return; }

  const data: { title?: string; done?: boolean } = {};
  if (body.data.title !== undefined && body.data.title !== sub.title) data.title = body.data.title;
  if (body.data.done !== undefined && body.data.done !== sub.done) data.done = body.data.done;
  const updated = Object.keys(data).length
    ? await prisma.$transaction(async (tx) => {
        const row = await tx.taskSubtask.update({ where: { id: sub.id }, data });
        if (data.done !== undefined) {
          await logActivity(tx, [{ taskId: task.id, actorId: ctx.actor.userId, type: data.done ? "subtask_done" : "subtask_reopened", data: { title: row.title } }]);
        }
        return row;
      })
    : sub;
  res.json({ id: updated.id, title: updated.title, done: updated.done, position: updated.position });
});

taskDetailsRouter.delete(`${base}/subtasks/:subtaskId`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (forbidEdit(res, ctx, task, "remove subtasks")) return;
  const sub = await openSubtask(req, res, task);
  if (!sub) return;
  await prisma.$transaction(async (tx) => {
    await tx.taskSubtask.delete({ where: { id: sub.id } });
    await logActivity(tx, [{ taskId: task.id, actorId: ctx.actor.userId, type: "subtask_removed", data: { title: sub.title } }]);
  });
  res.json({ ok: true });
});

// ── Attachments (same sniffing, sanitizing and per-kind limits as the project brief) ──────────

// POST …/attachments?filename=… — raw JPEG/PNG/WebP/PDF body (parser registered in app.ts).
taskDetailsRouter.post(`${base}/attachments`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (forbidEdit(res, ctx, task, "attach files")) return;

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Send a JPEG, PNG or WebP image, or a PDF." });
    return;
  }
  const mime = sniffBriefMime(body);
  if (!mime) { res.status(400).json({ error: "Only JPEG, PNG or WebP images and PDF files are accepted." }); return; }
  const kind = kindForMime(mime);
  if (kind === "IMAGE" && body.length > TASK_LIMITS.imageBytes) { res.status(413).json({ error: "Image is too large (max 1 MB)." }); return; }
  if (kind === "PDF" && body.length > TASK_LIMITS.pdfBytes) { res.status(413).json({ error: "PDF is too large (max 5 MB)." }); return; }
  const filename = sanitizeFilename(req.query.filename, kind === "PDF" ? "document.pdf" : "image");

  const result = await prisma.$transaction(async (tx) => {
    if ((await tx.taskAttachment.count({ where: { taskId: task.id } })) >= TASK_LIMITS.attachmentsPerTask) return "full-task" as const;
    const used = (await tx.taskAttachment.aggregate({ where: { projectId: ctx.groupId }, _sum: { size: true } }))._sum.size ?? 0;
    if (used + body.length > TASK_LIMITS.storagePerGroupBytes) return "full-group" as const;
    const row = await tx.taskAttachment.create({
      data: { taskId: task.id, projectId: ctx.groupId, kind, mime, filename, size: body.length, data: new Uint8Array(body), createdById: ctx.actor.userId },
      select: { id: true, kind: true, mime: true, filename: true, size: true, createdById: true, createdAt: true },
    });
    await logActivity(tx, [{ taskId: task.id, actorId: ctx.actor.userId, type: "attachment_added", data: { filename: row.filename } }]);
    return row;
  });

  if (result === "full-task") { res.status(409).json({ error: `A task can have at most ${TASK_LIMITS.attachmentsPerTask} attachments.` }); return; }
  if (result === "full-group") { res.status(409).json({ error: "This group has used its 50 MB of attachment storage. Remove a file first." }); return; }
  res.status(201).json({
    id: result.id, kind: result.kind, mime: result.mime, filename: result.filename, size: result.size,
    createdByUserId: result.createdById, createdAt: result.createdAt.toISOString(),
  });
});

async function openAttachment(req: Request, res: Response, task: TaskRow) {
  const aid = idParam.safeParse(req.params.attId);
  if (!aid.success) { res.status(400).json({ error: "Invalid attachment id" }); return null; }
  const att = await prisma.taskAttachment.findFirst({ where: { id: aid.data, taskId: task.id } });
  if (!att) { res.status(404).json({ error: "Attachment not found." }); return null; }
  return att;
}

// GET …/attachments/:attId[?download=1] — authenticated bytes, cacheable (immutable per id).
taskDetailsRouter.get(`${base}/attachments/:attId`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res);
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  const att = await openAttachment(req, res, task);
  if (!att) return;

  const etag = `"tatt-${att.id}-${att.size}-${att.createdAt.getTime()}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (att.kind === "PDF") {
    const safe = sanitizeFilename(att.filename, "document.pdf");
    res.setHeader("Content-Disposition", `${req.query.download === "1" ? "attachment" : "inline"}; filename="${safe}"`);
    res.setHeader("Content-Security-Policy", "sandbox");
  } else if (req.query.download === "1") {
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(att.filename, "image")}"`);
  }
  if (req.headers["if-none-match"] === etag) { res.status(304).end(); return; }
  res.setHeader("Content-Type", att.mime);
  res.send(Buffer.from(att.data));
});

taskDetailsRouter.delete(`${base}/attachments/:attId`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (forbidEdit(res, ctx, task, "remove attachments")) return;
  const att = await openAttachment(req, res, task);
  if (!att) return;
  await prisma.$transaction(async (tx) => {
    await tx.taskAttachment.delete({ where: { id: att.id } });
    await logActivity(tx, [{ taskId: task.id, actorId: ctx.actor.userId, type: "attachment_removed", data: { filename: att.filename } }]);
  });
  res.json({ ok: true });
});

// ── Comments (any member; edit/delete your own only) ──────────────────────────

const commentBody = z.object({ body: z.string().trim().min(1).max(TASK_LIMITS.comment) });

function commentView(c: { id: number; authorId: number; body: string; createdAt: Date; editedAt: Date | null }) {
  return { id: c.id, authorId: c.authorId, body: c.body, createdAt: c.createdAt.toISOString(), editedAt: c.editedAt ? c.editedAt.toISOString() : null };
}

// POST …/comments — per-user burst limit: taskCommentLimiter, wired in app.ts.
taskDetailsRouter.post(`${base}/comments`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (!canCommentOnTask(ctx.actor)) { res.status(403).json({ error: VIEW_ONLY }); return; }
  const parsed = commentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: `A comment needs text (max ${TASK_LIMITS.comment} characters).` }); return; }
  const bad = mentionError(ctx.project, parsed.data.body);
  if (bad) { res.status(400).json({ error: bad }); return; }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.taskComment.create({ data: { taskId: task.id, authorId: ctx.actor.userId, body: parsed.data.body } });
    await addWatchers(tx, task.id, [ctx.actor.userId]);
    await logActivity(tx, [{ taskId: task.id, actorId: ctx.actor.userId, type: "comment_added", data: { commentId: row.id } }]);
    return row;
  });

  // Mentioned members are always told; the watchers' comment alert skips anyone already mentioned.
  const mentioned = extractMentionIds(created.body).filter((id) => id !== ctx.actor.userId);
  await notifyMentions(ctx.project, ctx.actor.userId, task, mentioned, "comment");
  await notifyComment(ctx.project, ctx.actor.userId, task, mentioned);
  res.status(201).json(commentView(created));
});

async function openOwnComment(req: Request, res: Response, ctx: Ctx, task: TaskRow) {
  const cid = idParam.safeParse(req.params.commentId);
  if (!cid.success) { res.status(400).json({ error: "Invalid comment id" }); return null; }
  const comment = await prisma.taskComment.findUnique({ where: { id: cid.data } });
  if (!comment || comment.taskId !== task.id) { res.status(404).json({ error: "Comment not found." }); return null; }
  if (comment.authorId !== ctx.actor.userId) { res.status(403).json({ error: "You can only change your own comments." }); return null; }
  return comment;
}

taskDetailsRouter.patch(`${base}/comments/:commentId`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  const comment = await openOwnComment(req, res, ctx, task);
  if (!comment) return;
  const parsed = commentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: `A comment needs text (max ${TASK_LIMITS.comment} characters).` }); return; }
  const bad = mentionError(ctx.project, parsed.data.body);
  if (bad) { res.status(400).json({ error: bad }); return; }
  if (parsed.data.body === comment.body) { res.json(commentView(comment)); return; }

  const updated = await prisma.taskComment.update({ where: { id: comment.id }, data: { body: parsed.data.body, editedAt: new Date() } });
  const before = new Set(extractMentionIds(comment.body));
  await notifyMentions(ctx.project, ctx.actor.userId, task, extractMentionIds(updated.body).filter((id) => !before.has(id)), "comment");
  res.json(commentView(updated));
});

taskDetailsRouter.delete(`${base}/comments/:commentId`, requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  const comment = await openOwnComment(req, res, ctx, task);
  if (!comment) return;
  await prisma.taskComment.delete({ where: { id: comment.id } });
  res.json({ ok: true });
});

// ── Watch / unwatch (members) ─────────────────────────────────────────────────

async function setWatching(req: Request, res: Response, watching: boolean) {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (!canWatchTask(ctx.actor) || !isMemberOf(ctx.project, ctx.actor.userId)) { res.status(403).json({ error: VIEW_ONLY }); return; }
  if (watching) await addWatchers(prisma, task.id, [ctx.actor.userId]);
  else await prisma.taskWatcher.deleteMany({ where: { taskId: task.id, userId: ctx.actor.userId } });
  res.json(await loadDetails(ctx, task));
}

taskDetailsRouter.put(`${base}/watch`, requireAuth, (req: Request, res: Response) => setWatching(req, res, true));
taskDetailsRouter.delete(`${base}/watch`, requireAuth, (req: Request, res: Response) => setWatching(req, res, false));

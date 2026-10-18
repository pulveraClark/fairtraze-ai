import { Router } from "express";
import type { Request, Response } from "express";
import { TASK_LIMITS } from "@shared/taskTypes.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { effectiveTaskKey } from "../lib/taskKey.js";
import {
  CommitSyncError, formatWait, refreshWaitSeconds, syncGroupCommits, validateTaskKey,
} from "../lib/taskCommitLinks.js";
import { leaderOnly, openGroup } from "./tasks.js";

// Phase 5: commit linking and task keys. Planning data only. "Refresh commits" reads commit MESSAGES of
// the group's own repo; it creates no Report, Alert or score and never touches scoringConfigChangedAt or
// membershipChangedAt, so a report is never marked outdated by it.

export const taskCommitsRouter = Router();

// POST /api/groups/:id/tasks/sync-commits — leader only, once per 5 minutes per group (server-enforced).
taskCommitsRouter.post("/api/groups/:id/tasks/sync-commits", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can refresh commits.")) return;
  const { project } = ctx;

  if (!project.repoUrl || project.assignment?.sourceType === "EDITOR") {
    res.status(400).json({ error: "This group has no GitHub repository to read commits from." });
    return;
  }

  // Claim the cooldown atomically, so two clicks (or two tabs) cannot both run.
  const now = new Date();
  const previous = project.commitsRefreshedAt;
  const cutoff = new Date(now.getTime() - TASK_LIMITS.commitRefreshSeconds * 1000);
  const claimed = await prisma.project.updateMany({
    where: { id: project.id, OR: [{ commitsRefreshedAt: null }, { commitsRefreshedAt: { lte: cutoff } }] },
    data: { commitsRefreshedAt: now },
  });
  if (claimed.count === 0) {
    const latest = await prisma.project.findUnique({ where: { id: project.id }, select: { commitsRefreshedAt: true } });
    const wait = Math.max(1, refreshWaitSeconds(latest?.commitsRefreshedAt ?? null, now));
    res.set("Retry-After", String(wait));
    res.status(429).json({
      error: `Commits were refreshed a moment ago. Try again in ${formatWait(wait)}.`,
      retryAfterSeconds: wait,
      commitsRefreshedAt: latest?.commitsRefreshedAt?.toISOString() ?? null,
    });
    return;
  }

  try {
    const result = await syncGroupCommits({ id: project.id, repoUrl: project.repoUrl });
    res.json({ linked: result.linked, matched: result.matched, scanned: result.scanned, commitsRefreshedAt: now.toISOString() });
  } catch (err) {
    // A failed read does not use up the cooldown.
    await prisma.project.updateMany({ where: { id: project.id, commitsRefreshedAt: now }, data: { commitsRefreshedAt: previous } });
    if (err instanceof CommitSyncError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error(`[taskCommits] refresh failed for group ${project.id}`, err);
    res.status(500).json({ error: "Could not refresh commits." });
  }
});

// PATCH /api/groups/:id/task-key — leader only. The old key becomes an alias, so commits that still say
// "FT-12" keep linking; display always uses the current key.
taskCommitsRouter.patch("/api/groups/:id/task-key", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can change the task key.")) return;
  const { project } = ctx;

  const checked = validateTaskKey((req.body as { key?: unknown } | undefined)?.key);
  if (!checked.ok) { res.status(400).json({ error: checked.message }); return; }
  const next = checked.key;
  const current = effectiveTaskKey(project);

  const aliases = await prisma.taskKeyAlias.findMany({ where: { projectId: project.id }, select: { key: true } });
  if (next === current) {
    res.json({ taskKey: current, keyAliases: aliases.map((a) => a.key).sort() });
    return;
  }
  if (aliases.some((a) => a.key === next)) {
    res.status(409).json({ error: `${next} was this group's key before, so it can't be used again. Old keys keep linking commits.` });
    return;
  }

  // A key that was never shown (no task has ever been created) needs no alias.
  const everUsed = project.taskKey !== null || project.nextTaskNumber > 1;
  await prisma.$transaction(async (tx) => {
    if (everUsed) await tx.taskKeyAlias.createMany({ data: [{ projectId: project.id, key: current }], skipDuplicates: true });
    await tx.project.update({ where: { id: project.id }, data: { taskKey: next } });
  });
  const all = await prisma.taskKeyAlias.findMany({ where: { projectId: project.id }, select: { key: true } });
  res.json({ taskKey: next, keyAliases: all.map((a) => a.key).sort() });
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const alertsRouter = Router();

const idParam = z.coerce.number().int().positive();

const READ_RETENTION_DAYS = 30;

// ── GET /api/alerts ───────────────────────────────────────────────────────────
// Returns the logged-in user's notifications, newest first (any role).
// Optional page/pageSize for the full list page; without them returns all (for bell).
// unreadCount is always the DB total, accurate across all pages.
// There is no scheduler, so read notifications older than 30 days are pruned
// lazily here, for the requesting user only.

alertsRouter.get("/api/alerts", requireAuth, async (req, res) => {
  const recipientId = req.user!.sub;

  await prisma.alert
    .deleteMany({
      where: {
        recipientId,
        read: true,
        createdAt: { lt: new Date(Date.now() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000) },
      },
    })
    .catch((err) => console.error("[alerts] prune failed:", err));

  const rawPage = parseInt(String(req.query.page ?? ""), 10);
  const rawSize = parseInt(String(req.query.pageSize ?? ""), 10);
  const paginate  = Number.isFinite(rawPage) || Number.isFinite(rawSize);
  const page      = Number.isFinite(rawPage) && rawPage > 0  ? rawPage           : 1;
  const pageSize  = Number.isFinite(rawSize) && rawSize > 0  ? Math.min(rawSize, 100) : 20;

  const [alerts, unreadCount, total] = await Promise.all([
    prisma.alert.findMany({
      where:   { recipientId },
      orderBy: { createdAt: "desc" },
      ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      include: {
        project: {
          select: { id: true, groupName: true, assignmentLabel: true },
        },
      },
    }),
    prisma.alert.count({ where: { recipientId, read: false } }),
    paginate ? prisma.alert.count({ where: { recipientId } }) : Promise.resolve(0),
  ]);

  const base = { alerts, unreadCount };
  if (!paginate) return res.json(base);

  res.json({ ...base, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// ── GET /api/alerts/unread-count ──────────────────────────────────────────────
// Lightweight bell poll: one indexed COUNT, no list, no join, no prune.
// Registered before the /:id routes so "unread-count" is never parsed as an id.

alertsRouter.get("/api/alerts/unread-count", requireAuth, async (req, res) => {
  const unreadCount = await prisma.alert.count({
    where: { recipientId: req.user!.sub, read: false },
  });
  res.json({ unreadCount });
});

// ── POST /api/alerts/read-all ─────────────────────────────────────────────────
// Mark every unread notification for this user as read.
// Must come BEFORE /:id/read so Express doesn't treat "read-all" as an id.

alertsRouter.post("/api/alerts/read-all", requireAuth, async (req, res) => {
  const recipientId = req.user!.sub;

  await prisma.alert.updateMany({
    where: { recipientId, read: false },
    data: { read: true },
  });

  res.json({ ok: true });
});

// ── POST /api/alerts/:id/read ─────────────────────────────────────────────────
// Mark a single notification as read. Verifies it belongs to the caller.

alertsRouter.post("/api/alerts/:id/read", requireAuth, async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }

  const alert = await prisma.alert.findUnique({ where: { id: idResult.data } });
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  if (alert.recipientId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this alert" });
    return;
  }

  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: { read: true },
  });

  res.json(updated);
});

// ── DELETE /api/alerts/:id ────────────────────────────────────────────────────
// Dismiss a single notification. Verifies it belongs to the caller.

alertsRouter.delete("/api/alerts/:id", requireAuth, async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }

  const alert = await prisma.alert.findUnique({ where: { id: idResult.data } });
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  if (alert.recipientId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this alert" });
    return;
  }

  await prisma.alert.delete({ where: { id: alert.id } });
  res.json({ ok: true });
});

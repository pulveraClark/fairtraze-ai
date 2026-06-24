import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

export const alertsRouter = Router();

const idParam = z.coerce.number().int().positive();

// ── GET /api/alerts ───────────────────────────────────────────────────────────
// Returns the logged-in instructor's alerts, newest first.
// Response: { alerts: Alert[], unreadCount: number }

alertsRouter.get("/api/alerts", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const instructorId = req.user!.sub;

  const alerts = await prisma.alert.findMany({
    where: { instructorId },
    orderBy: { createdAt: "desc" },
    include: {
      project: {
        select: { id: true, groupName: true, assignmentLabel: true, name: true },
      },
    },
  });

  const unreadCount = alerts.filter((a) => !a.read).length;

  res.json({ alerts, unreadCount });
});

// ── POST /api/alerts/read-all ─────────────────────────────────────────────────
// Mark every unread alert for this instructor as read.
// Must come BEFORE /:id/read so Express doesn't treat "read-all" as an id.

alertsRouter.post("/api/alerts/read-all", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const instructorId = req.user!.sub;

  await prisma.alert.updateMany({
    where: { instructorId, read: false },
    data: { read: true },
  });

  res.json({ ok: true });
});

// ── POST /api/alerts/:id/read ─────────────────────────────────────────────────
// Mark a single alert as read. Verifies the alert belongs to the caller.

alertsRouter.post("/api/alerts/:id/read", ...requireRole("INSTRUCTOR"), async (req, res) => {
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
  if (alert.instructorId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this alert" });
    return;
  }

  const updated = await prisma.alert.update({
    where: { id: alert.id },
    data: { read: true },
  });

  res.json(updated);
});

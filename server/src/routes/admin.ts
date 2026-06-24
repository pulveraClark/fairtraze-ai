import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

export const adminRouter = Router();

const idParam   = z.coerce.number().int().positive();
const roleEnum  = z.enum(["ADMIN", "INSTRUCTOR", "STUDENT"]);

// Safe user select — never returns passwordHash.
const USER_SELECT = {
  id:             true,
  name:           true,
  email:          true,
  systemRole:     true,
  githubUsername: true,
  active:         true,
  createdAt:      true,
} as const;

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// List all users. Optional query params: search (name/email), role.

adminRouter.get("/api/admin/users", ...requireRole("ADMIN"), async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const roleRaw = typeof req.query.role === "string" ? req.query.role : "";
  const roleParsed = roleEnum.safeParse(roleRaw);

  const users = await prisma.user.findMany({
    where: {
      ...(roleParsed.success ? { systemRole: roleParsed.data } : {}),
      ...(search ? {
        OR: [
          { name:  { contains: search } },
          { email: { contains: search } },
        ],
      } : {}),
    },
    select:  USER_SELECT,
    orderBy: { createdAt: "desc" },
  });

  res.json({ users });
});

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
// Change a user's systemRole. An admin cannot demote their own account.

adminRouter.patch("/api/admin/users/:id/role", ...requireRole("ADMIN"), async (req, res) => {
  const idResult   = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }

  const bodyResult = z.object({ role: roleEnum }).safeParse(req.body);
  if (!bodyResult.success) { res.status(400).json({ error: "Invalid role. Must be ADMIN, INSTRUCTOR, or STUDENT." }); return; }

  const targetId = idResult.data;
  const { role } = bodyResult.data;

  if (targetId === req.user!.sub && role !== "ADMIN") {
    res.status(403).json({ error: "You cannot change your own role. Ask another admin to do it." });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const updated = await prisma.user.update({
    where:  { id: targetId },
    data:   { systemRole: role },
    select: USER_SELECT,
  });

  res.json(updated);
});

// ── PATCH /api/admin/users/:id/status ────────────────────────────────────────
// Activate or deactivate a user. An admin cannot deactivate their own account.

adminRouter.patch("/api/admin/users/:id/status", ...requireRole("ADMIN"), async (req, res) => {
  const idResult   = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }

  const bodyResult = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!bodyResult.success) { res.status(400).json({ error: "active must be a boolean" }); return; }

  const targetId = idResult.data;

  if (targetId === req.user!.sub) {
    res.status(403).json({ error: "You cannot deactivate your own account." });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const updated = await prisma.user.update({
    where:  { id: targetId },
    data:   { active: bodyResult.data.active },
    select: USER_SELECT,
  });

  res.json(updated);
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
// Permanently delete a user and all directly associated data.
// An admin cannot delete their own account.

adminRouter.delete("/api/admin/users/:id", ...requireRole("ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }

  const targetId = idResult.data;

  if (targetId === req.user!.sub) {
    res.status(403).json({ error: "You cannot delete your own account." });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, name: true } });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Manual cascade in the correct FK order so no RESTRICT constraint fires.
  // 1. Disputes this user raised (studentUserId FK is RESTRICT)
  // 2. Alerts where this instructor is the recipient (instructorId FK is RESTRICT)
  // 3. GroupMemberships this user holds (userId FK is RESTRICT)
  // 4. ClassSections this instructor owns (cascades → Assignments → Projects → everything else)
  // 5. Delete the user
  await prisma.$transaction(async (tx) => {
    await tx.dispute.deleteMany({ where: { studentUserId: targetId } });
    await tx.alert.deleteMany({ where: { instructorId: targetId } });
    await tx.groupMembership.deleteMany({ where: { userId: targetId } });
    await tx.classSection.deleteMany({ where: { instructorId: targetId } });
    await tx.user.delete({ where: { id: targetId } });
  });

  res.json({ message: `User "${target.name}" deleted.` });
});

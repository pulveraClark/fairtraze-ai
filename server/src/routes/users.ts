import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const usersRouter = Router();

const updateProfileSchema = z.object({
  name:           z.string().min(1, "Name is required").optional(),
  githubUsername: z.string().min(1).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8, "New password must be at least 8 characters"),
});

// PATCH /api/users/me — update name and/or githubUsername (role and email are not self-editable)
usersRouter.patch("/api/users/me", requireAuth, async (req, res) => {
  const result = updateProfileSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { name, githubUsername } = result.data;

  if (name === undefined && githubUsername === undefined) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.sub },
    data:  {
      ...(name !== undefined             ? { name }           : {}),
      ...(githubUsername !== undefined   ? { githubUsername } : {}),
    },
  });

  res.json({
    id:             updated.id,
    email:          updated.email,
    name:           updated.name,
    systemRole:     updated.systemRole,
    githubUsername: updated.githubUsername,
  });
});

// POST /api/users/me/password — verify current password and set a new one
usersRouter.post("/api/users/me/password", requireAuth, async (req, res) => {
  const result = changePasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const { currentPassword, newPassword } = result.data;

  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  res.json({ message: "Password updated successfully" });
});

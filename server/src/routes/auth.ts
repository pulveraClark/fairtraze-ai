import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { SystemRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { authenticateToken } from "../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  name:     z.string().min(1),
  role:     z.enum(["ADMIN", "INSTRUCTOR", "STUDENT"]).optional(),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
authRouter.post("/api/auth/register", async (req, res) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const { email, password, name, role } = result.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      systemRole: (role ?? "STUDENT") as SystemRole,
    },
  });

  const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.systemRole });

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole },
  });
});

// POST /api/auth/login
authRouter.post("/api/auth/login", async (req, res) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Generic message — don't reveal whether the email exists
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (!user.active) {
    res.status(403).json({ error: "Your account has been deactivated. Contact an administrator." });
    return;
  }

  const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.systemRole });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole },
  });
});

// POST /api/auth/logout — stateless; client drops its token
authRouter.post("/api/auth/logout", (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

// GET /api/auth/me — return current user from token
authRouter.get("/api/auth/me", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Re-fetch from DB so the response reflects the current state
  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  if (!user.active) {
    res.status(403).json({ error: "Account deactivated" });
    return;
  }

  res.json({
    id:             user.id,
    email:          user.email,
    name:           user.name,
    systemRole:     user.systemRole,
    githubUsername: user.githubUsername,
    createdAt:      user.createdAt,
  });
});

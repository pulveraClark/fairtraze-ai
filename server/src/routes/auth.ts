import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { SystemRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { authenticateToken } from "../middleware/auth.js";
import { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } from "../lib/refreshToken.js";
import { issueResetToken, consumeResetToken } from "../lib/passwordReset.js";
import { issueVerificationToken, consumeVerificationToken } from "../lib/emailVerification.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email.js";

export const authRouter = Router();

const REFRESH_COOKIE_NAME = "ft_refresh_token";
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
  });
}

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

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token:       z.string().min(1),
  newPassword: z.string().min(8),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
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
      emailVerified: false,
    },
  });

  const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.systemRole });
  const refreshToken = await issueRefreshToken(user.id);
  setRefreshCookie(res, refreshToken);

  const rawVerifyToken = await issueVerificationToken(user.id);
  const verifyLink = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/verify-email?token=${rawVerifyToken}`;
  // A delivery failure must not block registration — the account is already
  // created; the user can request a fresh link via resend-verification.
  sendVerificationEmail(user.email, user.name, verifyLink).catch((err) =>
    console.error("[auth] failed to send verification email", err)
  );

  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole, githubUsername: user.githubUsername ?? null, emailVerified: user.emailVerified },
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
  const refreshToken = await issueRefreshToken(user.id);
  setRefreshCookie(res, refreshToken);

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, systemRole: user.systemRole, githubUsername: user.githubUsername ?? null, emailVerified: user.emailVerified },
  });
});

// POST /api/auth/refresh — exchange a valid refresh token cookie for a new access token
authRouter.post("/api/auth/refresh", async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!rawToken) {
    res.status(401).json({ error: "No refresh token provided" });
    return;
  }

  const rotated = await rotateRefreshToken(rawToken);
  if (!rotated) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user || !user.active) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Account no longer available" });
    return;
  }

  const token = signToken({ sub: user.id, email: user.email, name: user.name, role: user.systemRole });
  setRefreshCookie(res, rotated.newRawToken);

  res.json({ token });
});

// POST /api/auth/logout — revokes the refresh token server-side
authRouter.post("/api/auth/logout", async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (rawToken) {
    await revokeRefreshToken(rawToken);
  }
  clearRefreshCookie(res);
  res.json({ message: "Logged out successfully" });
});

const GENERIC_FORGOT_PASSWORD_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

// POST /api/auth/forgot-password
authRouter.post("/api/auth/forgot-password", async (req, res) => {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const { email } = result.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    const rawToken = await issueResetToken(user.id);
    const resetLink = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/reset-password?token=${rawToken}`;
    // A delivery failure must not change the response — that would leak
    // whether the email is registered, and would break the UX besides.
    sendPasswordResetEmail(user.email, user.name, resetLink).catch((err) =>
      console.error("[auth] failed to send password reset email", err)
    );
  }

  res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
});

// POST /api/auth/reset-password
authRouter.post("/api/auth/reset-password", async (req, res) => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const { token, newPassword } = result.data;

  const userId = await consumeResetToken(token);
  if (!userId) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // A password reset should terminate every existing session, not just
  // prompt a normal re-login — in case the reset was triggered because
  // credentials were compromised.
  await prisma.refreshToken.deleteMany({ where: { userId } });

  res.json({ message: "Password reset successful. Please log in with your new password." });
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
    emailVerified:  user.emailVerified,
    createdAt:      user.createdAt,
  });
});

// POST /api/auth/verify-email
authRouter.post("/api/auth/verify-email", async (req, res) => {
  const result = verifyEmailSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid input", details: result.error.flatten() });
    return;
  }

  const userId = await consumeVerificationToken(result.data.token);
  if (!userId) {
    res.status(400).json({ error: "This verification link is invalid or has expired." });
    return;
  }

  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });

  res.json({ message: "Email verified successfully." });
});

// POST /api/auth/resend-verification — authenticated, so it can't be used to
// probe which emails are registered (unlike forgot-password, which must stay
// generic because it's reachable while logged out).
authRouter.post("/api/auth/resend-verification", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }

  if (user.emailVerified) {
    res.json({ message: "Your email is already verified." });
    return;
  }

  const rawVerifyToken = await issueVerificationToken(user.id);
  const verifyLink = `${process.env.FRONTEND_URL ?? "http://localhost:5173"}/verify-email?token=${rawVerifyToken}`;
  sendVerificationEmail(user.email, user.name, verifyLink).catch((err) =>
    console.error("[auth] failed to send verification email", err)
  );

  res.json({ message: "Verification email sent." });
});

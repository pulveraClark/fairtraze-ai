import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { authRouter } from "./auth.js";
import { prisma } from "../lib/prisma.js";

// Minimal app mounting only authRouter — deliberately skips the shared
// authLimiter (security.ts) since it's an IP-keyed singleton that would
// otherwise throttle this file's many same-IP login attempts and is not
// itself under test here.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
  return app;
}

const PASSWORD = "correct-horse-battery-staple";

async function createUser(email: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.user.create({
    data: { email, passwordHash, name: "Test User", systemRole: "STUDENT", emailVerified: true },
  });
}

describe("login lockout", () => {
  let app: express.Express;

  beforeEach(() => {
    app = buildApp();
  });

  it("locks the account after 6 consecutive failed attempts and keeps a 7th correct-password attempt rejected", async () => {
    const user = await createUser("lockout@example.com");

    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: user.email, password: "wrong-password" });
      expect(res.status).toBe(401);
    }

    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.failedLoginAttempts).toBe(6);
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Correct password no longer works while locked.
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid email or password" });
    expect(res.body.token).toBeUndefined();
  });

  it("does not lock the account before the threshold is reached", async () => {
    const user = await createUser("nearlock@example.com");

    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
    }

    const notYetLocked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(notYetLocked.failedLoginAttempts).toBe(5);
    expect(notYetLocked.lockedUntil).toBeNull();

    // Still allowed through with the correct password.
    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("resets failedLoginAttempts and lockedUntil to zero/null on a successful login", async () => {
    const user = await createUser("reset@example.com");

    for (let i = 0; i < 3; i++) {
      await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
    }
    const beforeSuccess = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(beforeSuccess.failedLoginAttempts).toBe(3);

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);

    const afterSuccess = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(afterSuccess.failedLoginAttempts).toBe(0);
    expect(afterSuccess.lockedUntil).toBeNull();
  });

  it("unlocks automatically once lockedUntil is in the past, without any explicit unlock action", async () => {
    const user = await createUser("autoexpire@example.com");
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 6, lockedUntil: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.failedLoginAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  it("clears a lockout via reset-password, matching the login-success reset", async () => {
    const user = await createUser("resetpw@example.com");
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 6, lockedUntil: new Date(Date.now() + 60 * 1000) },
    });

    // Issue a real reset token the same way forgot-password does, since
    // reset-password requires a valid token, not just the user id.
    const { issueResetToken } = await import("../lib/passwordReset.js");
    const rawToken = await issueResetToken(user.id);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, newPassword: "brand-new-password-1" });
    expect(res.status).toBe(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.failedLoginAttempts).toBe(0);
    expect(after.lockedUntil).toBeNull();

    // New password now works.
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "brand-new-password-1" });
    expect(loginRes.status).toBe(200);
  });

  it("returns byte-identical responses for unknown email, wrong password, and a locked account", async () => {
    const lockedUser = await createUser("identical@example.com");
    await prisma.user.update({
      where: { id: lockedUser.id },
      data: { failedLoginAttempts: 6, lockedUntil: new Date(Date.now() + 60 * 1000) },
    });
    const otherUser = await createUser("identical2@example.com");

    const unknownEmailRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "no-such-account@example.com", password: "whatever" });

    const wrongPasswordRes = await request(app)
      .post("/api/auth/login")
      .send({ email: otherUser.email, password: "wrong-password" });

    const lockedRes = await request(app)
      .post("/api/auth/login")
      .send({ email: lockedUser.email, password: PASSWORD });

    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    expect(lockedRes.status).toBe(401);

    expect(unknownEmailRes.body).toEqual(wrongPasswordRes.body);
    expect(wrongPasswordRes.body).toEqual(lockedRes.body);
    expect(unknownEmailRes.body).toEqual({ error: "Invalid email or password" });

    // Same header set too — a distinct WWW-Authenticate/custom header on the
    // locked case would leak the same information a differing body would.
    const relevantHeaders = (h: Record<string, string>) => {
      const { date, ...rest } = h;
      void date;
      return rest;
    };
    expect(relevantHeaders(wrongPasswordRes.headers)).toEqual(relevantHeaders(unknownEmailRes.headers));
    expect(relevantHeaders(lockedRes.headers)).toEqual(relevantHeaders(unknownEmailRes.headers));
  });
});

import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor, CONSENT } from "./factories.js";

// This file exercises auth-flow correctness (many login/register/forgot-password
// calls per test file), not rate limiting — that's rateLimit.test.ts's job.
// authLimiter is a single IP-keyed singleton shared across those three routes,
// so without this mock the cumulative request count across this file's tests
// would trip the real 10-per-window cap and fail unrelated assertions.
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>(
    "../src/middleware/security.js"
  );
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const app = createApp();

function extractRefreshCookie(res: request.Response): string {
  const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
  const raw = setCookie?.find((c) => c.startsWith("ft_refresh_token="));
  if (!raw) throw new Error("No refresh cookie set on response");
  return raw.split(";")[0];
}

describe("POST /api/auth/register", () => {
  it("creates a user and returns a token + refresh cookie", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...CONSENT,
      email: "new@example.com",
      password: "password123",
      name: "New User",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("new@example.com");
    expect(extractRefreshCookie(res)).toContain("ft_refresh_token=");
  });

  it("creates a newly-registered account as unverified (emailVerified: false)", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...CONSENT,
      email: "unverified@example.com",
      password: "password123",
      name: "Unverified User",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.emailVerified).toBe(false);

    const dbUser = await prisma.user.findUnique({ where: { email: "unverified@example.com" } });
    expect(dbUser?.emailVerified).toBe(false);
  });

  it("rejects a self-registered ADMIN role with 400 and creates no account", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...CONSENT,
      email: "sneaky-admin@example.com",
      password: "password123",
      name: "Sneaky",
      role: "ADMIN",
    });
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: "sneaky-admin@example.com" } })).toBeNull();
  });

  it.each(["INSTRUCTOR", "STUDENT"] as const)("still allows self-registering as %s", async (role) => {
    const res = await request(app).post("/api/auth/register").send({ ...CONSENT,
      email: `${role.toLowerCase()}@example.com`,
      password: "password123",
      name: "Allowed",
      role,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.systemRole).toBe(role);
  });

  it("rejects a duplicate email with 409", async () => {
    await createUser({ email: "dup@example.com" });
    const res = await request(app).post("/api/auth/register").send({ ...CONSENT,
      email: "dup@example.com",
      password: "password123",
      name: "Dup",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  // AUTH-06
  it("returns the same generic error for an unknown email as for a wrong password", async () => {
    await createUser({ email: "known@example.com", password: "correct-password" });

    const unknownEmailRes = await request(app).post("/api/auth/login").send({
      email: "unknown@example.com",
      password: "whatever",
    });
    const wrongPasswordRes = await request(app).post("/api/auth/login").send({
      email: "known@example.com",
      password: "wrong-password",
    });

    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPasswordRes.status).toBe(401);
    expect(unknownEmailRes.body.error).toBe(wrongPasswordRes.body.error);
  });

  // AUTH-07 (partial)
  it("logs in successfully with correct credentials", async () => {
    await createUser({ email: "gooduser@example.com", password: "correct-password" });

    const res = await request(app).post("/api/auth/login").send({
      email: "gooduser@example.com",
      password: "correct-password",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  // INT-004
  it("rejects login for a deactivated account with 403", async () => {
    await createUser({ email: "deactivated@example.com", password: "correct-password", active: false });

    const res = await request(app).post("/api/auth/login").send({
      email: "deactivated@example.com",
      password: "correct-password",
    });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth/refresh", () => {
  it("rotates the refresh token and returns a fresh access token", async () => {
    await createUser({ email: "refresh@example.com", password: "password123" });
    const loginRes = await request(app).post("/api/auth/login").send({
      email: "refresh@example.com",
      password: "password123",
    });
    const firstCookie = extractRefreshCookie(loginRes);

    const refreshRes = await request(app).post("/api/auth/refresh").set("Cookie", firstCookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.token).toBeTruthy();
    const secondCookie = extractRefreshCookie(refreshRes);
    expect(secondCookie).not.toBe(firstCookie);
  });

  it("rejects a replayed (already-rotated) refresh token", async () => {
    await createUser({ email: "replay@example.com", password: "password123" });
    const loginRes = await request(app).post("/api/auth/login").send({
      email: "replay@example.com",
      password: "password123",
    });
    const firstCookie = extractRefreshCookie(loginRes);

    // First use rotates it away.
    await request(app).post("/api/auth/refresh").set("Cookie", firstCookie);

    // Replaying the same (now-deleted) token must fail — current behavior is
    // fail-closed (401) but without reuse-detection/session-family revocation.
    const replayRes = await request(app).post("/api/auth/refresh").set("Cookie", firstCookie);
    expect(replayRes.status).toBe(401);
  });

  it("rejects a refresh request with no cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the refresh token so it can no longer be used", async () => {
    await createUser({ email: "logout@example.com", password: "password123" });
    const loginRes = await request(app).post("/api/auth/login").send({
      email: "logout@example.com",
      password: "password123",
    });
    const cookie = extractRefreshCookie(loginRes);

    const logoutRes = await request(app).post("/api/auth/logout").set("Cookie", cookie);
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(refreshAfterLogout.status).toBe(401);
  });
});

describe("password reset flow", () => {
  it("returns the same generic message for an existing and a non-existing email", async () => {
    await createUser({ email: "hasaccount@example.com" });

    const existingRes = await request(app).post("/api/auth/forgot-password").send({
      email: "hasaccount@example.com",
    });
    const nonExistingRes = await request(app).post("/api/auth/forgot-password").send({
      email: "noaccount@example.com",
    });

    expect(existingRes.status).toBe(200);
    expect(nonExistingRes.status).toBe(200);
    expect(existingRes.body.message).toBe(nonExistingRes.body.message);
  });

  it("returns the identical generic response when the email sender throws synchronously", async () => {
    await createUser({ email: "sendfails@example.com" });
    const { sendPasswordResetEmail } = await import("../src/lib/email.js");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendPasswordResetEmail).mockImplementationOnce(() => { throw new Error("boom"); });
    try {
      const failing = await request(app).post("/api/auth/forgot-password").send({ email: "sendfails@example.com" });
      const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" });
      expect(failing.status).toBe(200);
      expect(failing.body).toEqual(unknown.body);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("resets the password and invalidates all existing refresh tokens for that user", async () => {
    const { user } = await createUser({ email: "reset@example.com", password: "old-password" });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "reset@example.com",
      password: "old-password",
    });
    const refreshCookie = extractRefreshCookie(loginRes);

    // Issue a real reset token directly (forgot-password's token isn't
    // returned in the response body by design — it only ever goes out via email).
    const { issueResetToken } = await import("../src/lib/passwordReset.js");
    const rawToken = await issueResetToken(user.id);

    const resetRes = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "new-password123",
    });
    expect(resetRes.status).toBe(200);

    // Old session must be dead post-reset.
    const refreshAfterReset = await request(app).post("/api/auth/refresh").set("Cookie", refreshCookie);
    expect(refreshAfterReset.status).toBe(401);

    // New password logs in; old password no longer works.
    const loginWithNewPassword = await request(app).post("/api/auth/login").send({
      email: "reset@example.com",
      password: "new-password123",
    });
    expect(loginWithNewPassword.status).toBe(200);

    const loginWithOldPassword = await request(app).post("/api/auth/login").send({
      email: "reset@example.com",
      password: "old-password",
    });
    expect(loginWithOldPassword.status).toBe(401);
  });

  it("consumes an expired reset token on first lookup instead of leaving it replayable", async () => {
    const { user } = await createUser({ email: "expired@example.com" });
    const { issueResetToken } = await import("../src/lib/passwordReset.js");
    const rawToken = await issueResetToken(user.id);

    // Force it into the past.
    const crypto = await import("crypto");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const firstAttempt = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "whatever123",
    });
    expect(firstAttempt.status).toBe(400);

    // Row should already be gone (deleted on lookup before the expiry check),
    // so a second attempt with the same token also 400s — not a distinct code path.
    const secondAttempt = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "whatever123",
    });
    expect(secondAttempt.status).toBe(400);
  });

  // The mocked sender receives the link, which is the only place the raw token ever appears.
  async function lastResetToken(): Promise<string> {
    const { sendPasswordResetEmail } = await import("../src/lib/email.js");
    const calls = vi.mocked(sendPasswordResetEmail).mock.calls;
    const link = calls[calls.length - 1][2];
    return new URL(link).searchParams.get("token") as string;
  }

  it("a new request cancels the older unused link; only the newest works", async () => {
    const { user } = await createUser({ email: "twice@example.com", password: "old-password" });

    await request(app).post("/api/auth/forgot-password").send({ email: "twice@example.com" });
    const firstToken = await lastResetToken();
    await request(app).post("/api/auth/forgot-password").send({ email: "twice@example.com" });
    const secondToken = await lastResetToken();

    expect(firstToken).not.toBe(secondToken);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    const oldLink = await request(app).post("/api/auth/reset-password").send({ token: firstToken, newPassword: "new-password123" });
    expect(oldLink.status).toBe(400);
    const newLink = await request(app).post("/api/auth/reset-password").send({ token: secondToken, newPassword: "new-password123" });
    expect(newLink.status).toBe(200);
  });

  it("a used link cannot be used again", async () => {
    const { user } = await createUser({ email: "usedonce@example.com" });
    const { issueResetToken } = await import("../src/lib/passwordReset.js");
    const rawToken = await issueResetToken(user.id);

    const first = await request(app).post("/api/auth/reset-password").send({ token: rawToken, newPassword: "first-password1" });
    const second = await request(app).post("/api/auth/reset-password").send({ token: rawToken, newPassword: "second-password1" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    const login = await request(app).post("/api/auth/login").send({ email: "usedonce@example.com", password: "first-password1" });
    expect(login.status).toBe(200);
  });

  it("a deactivated account gets the same answer, no email and no token", async () => {
    const { user } = await createUser({ email: "gone@example.com" });
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    const { sendPasswordResetEmail } = await import("../src/lib/email.js");
    vi.mocked(sendPasswordResetEmail).mockClear();

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "gone@example.com" });
    const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "never-existed@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(unknown.body);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it("finds the account whatever the letter case of the email", async () => {
    await createUser({ email: "MixedCase@Example.com" });
    const { sendPasswordResetEmail } = await import("../src/lib/email.js");
    vi.mocked(sendPasswordResetEmail).mockClear();

    await request(app).post("/api/auth/forgot-password").send({ email: "mixedcase@example.com" });
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("with no BREVO_API_KEY the real sender does not throw, calls nothing and logs only a fixed line", async () => {
    const before = { key: process.env.BREVO_API_KEY, from: process.env.MAIL_FROM };
    delete process.env.BREVO_API_KEY;
    delete process.env.MAIL_FROM;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const real = await vi.importActual<typeof import("../src/lib/email.js")>("../src/lib/email.js");
      await expect(real.sendPasswordResetEmail("a@example.com", "A", "http://x/reset-password?token=SECRETTOKEN")).resolves.toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith("[mail] mail not configured");
      const logged = JSON.stringify([...warnSpy.mock.calls, ...logSpy.mock.calls]);
      expect(logged).not.toContain("SECRETTOKEN");
      expect(logged).not.toContain("a@example.com");
    } finally {
      fetchSpy.mockRestore();
      warnSpy.mockRestore();
      logSpy.mockRestore();
      if (before.key !== undefined) process.env.BREVO_API_KEY = before.key;
      if (before.from !== undefined) process.env.MAIL_FROM = before.from;
    }
  });

  it("writes PASSWORD_RESET_REQUESTED and PASSWORD_RESET_COMPLETED rows without token or email", async () => {
    const { user } = await createUser({ email: "audited@example.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "audited@example.com" });
    const token = await lastResetToken();
    await request(app).post("/api/auth/reset-password").send({ token, newPassword: "audited-password1" });

    const rows = await prisma.auditLog.findMany({
      where: { actorId: user.id, action: { startsWith: "PASSWORD_RESET_" } },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => r.action)).toEqual(["PASSWORD_RESET_REQUESTED", "PASSWORD_RESET_COMPLETED"]);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain("audited@example.com");
  });
});

describe("email verification — grandfathering existing users", () => {
  it("a user row created without an explicit emailVerified value reads true (schema default)", async () => {
    // Mirrors how every pre-existing account (seeded demo users, any real
    // account created before this feature shipped) is grandfathered by the
    // migration's column default — not by a separate backfill script.
    const { user } = await createUser({ email: "grandfathered@example.com" });
    expect(user.emailVerified).toBe(true);
  });

  it("a user created through the register route reads false (explicit override at that call site)", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...CONSENT,
      email: "freshsignup@example.com",
      password: "password123",
      name: "Fresh Signup",
    });
    expect(res.body.user.emailVerified).toBe(false);
  });
});

describe("email verification flow", () => {
  it("verifies email with a valid token, consuming it (single-use)", async () => {
    const { user } = await createUser({ email: "toverify@example.com", emailVerified: false });
    const { issueVerificationToken } = await import("../src/lib/emailVerification.js");
    const rawToken = await issueVerificationToken(user.id);

    const verifyRes = await request(app).post("/api/auth/verify-email").send({ token: rawToken });
    expect(verifyRes.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.emailVerified).toBe(true);

    // Replaying the same (now-deleted) token must fail.
    const replayRes = await request(app).post("/api/auth/verify-email").send({ token: rawToken });
    expect(replayRes.status).toBe(400);
  });

  it("rejects an invalid/unknown token with 400", async () => {
    const res = await request(app).post("/api/auth/verify-email").send({ token: "not-a-real-token" });
    expect(res.status).toBe(400);
  });

  it("consumes an expired verification token on first lookup instead of leaving it replayable", async () => {
    const { user } = await createUser({ email: "expiredverify@example.com", emailVerified: false });
    const { issueVerificationToken } = await import("../src/lib/emailVerification.js");
    const rawToken = await issueVerificationToken(user.id);

    const crypto = await import("crypto");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.emailVerificationToken.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const firstAttempt = await request(app).post("/api/auth/verify-email").send({ token: rawToken });
    expect(firstAttempt.status).toBe(400);

    const secondAttempt = await request(app).post("/api/auth/verify-email").send({ token: rawToken });
    expect(secondAttempt.status).toBe(400);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.emailVerified).toBe(false);
  });

  it("requires authentication to resend a verification email", async () => {
    const res = await request(app).post("/api/auth/resend-verification");
    expect(res.status).toBe(401);
  });

  it("issues a new, usable token when an unverified user resends", async () => {
    const { user } = await createUser({ email: "resend@example.com", emailVerified: false });

    const { sendVerificationEmail } = await import("../src/lib/email.js");
    const mockedSend = vi.mocked(sendVerificationEmail);
    mockedSend.mockClear();

    const resendRes = await request(app)
      .post("/api/auth/resend-verification")
      .set("Authorization", authHeaderFor(user));
    expect(resendRes.status).toBe(200);
    expect(mockedSend).toHaveBeenCalledTimes(1);

    const verifyLink = mockedSend.mock.calls[0][2];
    const rawToken = new URL(verifyLink).searchParams.get("token")!;

    const verifyRes = await request(app).post("/api/auth/verify-email").send({ token: rawToken });
    expect(verifyRes.status).toBe(200);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser?.emailVerified).toBe(true);
  });

  it("resending for an already-verified user is idempotent and issues no new token", async () => {
    const { user } = await createUser({ email: "alreadyverified@example.com", emailVerified: true });

    const before = await prisma.emailVerificationToken.count({ where: { userId: user.id } });

    const res = await request(app)
      .post("/api/auth/resend-verification")
      .set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(200);

    const after = await prisma.emailVerificationToken.count({ where: { userId: user.id } });
    expect(after).toBe(before);
  });
});

describe("JWT edge cases", () => {
  it("rejects an expired access token on a protected route", async () => {
    const { user } = await createUser({ email: "expiredjwt@example.com" });
    const jwt = await import("jsonwebtoken");
    const expiredToken = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.systemRole },
      process.env.AUTH_SECRET as string,
      { expiresIn: "-1s" }
    );

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const { user } = await createUser({ email: "badsig@example.com" });
    const jwt = await import("jsonwebtoken");
    const tamperedToken = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: user.systemRole },
      "not-the-real-secret",
      { expiresIn: "15m" }
    );

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });

  it("does not pick up a role change until the token is refreshed (documents current staleness window)", async () => {
    const { user } = await createUser({ email: "rolechange@example.com", systemRole: "STUDENT" });
    const jwt = await import("jsonwebtoken");
    const staleToken = jwt.sign(
      { sub: user.id, email: user.email, name: user.name, role: "STUDENT" },
      process.env.AUTH_SECRET as string,
      { expiresIn: "15m" }
    );

    await prisma.user.update({ where: { id: user.id }, data: { systemRole: "INSTRUCTOR" } });

    // requireRole("INSTRUCTOR") reads the role embedded in the JWT, not the
    // DB — so the stale token is still rejected from an instructor-only route
    // until it's refreshed. This pins down that the staleness window is safe
    // (fails closed), not that it's unnoticeable.
    const res = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${staleToken}`);
    expect(res.status).toBe(403);
  });
});

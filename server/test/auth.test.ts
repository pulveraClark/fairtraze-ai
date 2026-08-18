import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createUser } from "./factories.js";

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
    const res = await request(app).post("/api/auth/register").send({
      email: "new@example.com",
      password: "password123",
      name: "New User",
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("new@example.com");
    expect(extractRefreshCookie(res)).toContain("ft_refresh_token=");
  });

  it("rejects a duplicate email with 409", async () => {
    await createUser({ email: "dup@example.com" });
    const res = await request(app).post("/api/auth/register").send({
      email: "dup@example.com",
      password: "password123",
      name: "Dup",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
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

  it("logs in successfully with correct credentials", async () => {
    await createUser({ email: "gooduser@example.com", password: "correct-password" });

    const res = await request(app).post("/api/auth/login").send({
      email: "gooduser@example.com",
      password: "correct-password",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

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

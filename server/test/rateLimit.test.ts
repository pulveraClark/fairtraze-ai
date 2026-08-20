import express from "express";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { authenticateToken } from "../src/middleware/auth.js";
import { analysisLimiter } from "../src/middleware/security.js";
import { signToken } from "../src/lib/jwt.js";

// The rate limiters in middleware/security.ts are module-level singletons —
// this file gets its own fresh module registry (fileParallelism: false +
// vitest's default per-file isolation), so the counts below start at zero
// and don't leak into/from other test files.
const app = createApp();

// A minimal app that mounts the exact same analysisLimiter singleton exported
// from middleware/security.ts (not createApp()'s full app) behind
// authenticateToken, mirroring exactly how app.ts wires them for
// /api/projects/:id/analyze and /api/projects/:id/narrative. This exercises
// the real keying/ceiling behavior without needing a real project, a real
// GitHub token, or 80+ real GitHub API round trips per test.
const limiterTestApp = express();
limiterTestApp.use(authenticateToken, analysisLimiter);
limiterTestApp.get("/probe", (req, res) => {
  res.json({ ok: true, userId: req.user?.sub ?? null });
});

function tokenFor(sub: number): string {
  return signToken({ sub, email: `instructor${sub}@example.com`, name: `Instructor ${sub}`, role: "INSTRUCTOR" });
}

describe("rate limiting", () => {
  it("throttles /api/auth/login after its configured max (10 per window)", async () => {
    const attempt = () =>
      request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "x" });

    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(await attempt());
    }

    const statuses = results.map((r) => r.status);
    // First 10 are handled normally (401 — unknown user), the 11th is throttled.
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("does not apply the auth limiter to /api/auth/refresh (documents current gap)", async () => {
    // authLimiter is only wired to login/register/forgot-password (index.ts /
    // app.ts). Refresh and reset-password fall through to the much looser
    // globalLimiter (300/15min) instead — this test pins down that gap so a
    // future fix is a deliberate, visible change.
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(await request(app).post("/api/auth/refresh"));
    }
    // All 11 get a normal 401 (no refresh cookie) — none throttled, because
    // authLimiter's 10-request threshold doesn't apply to this route.
    expect(results.every((r) => r.status === 401)).toBe(true);
  });

  it("keys analysisLimiter by instructor id (not IP) with an 80/15min ceiling per instructor", async () => {
    // Distinct, arbitrary subs — not tied to any real DB row, since
    // authenticateToken only verifies the JWT signature and analysisLimiter
    // keys off req.user.sub, neither of which touches the database. Using
    // synthetic ids also sidesteps the global per-test TRUNCATE...RESTART
    // IDENTITY (setupEnv.ts) that would otherwise let a later test's
    // createUser() reuse a low autoincrement id and collide with a bucket
    // left over from an earlier test in this same file.
    const instructorA = tokenFor(910001);
    const instructorB = tokenFor(910002);

    const attemptAs = (token: string) =>
      request(limiterTestApp).get("/probe").set("Authorization", `Bearer ${token}`);

    const resultsA = [];
    for (let i = 0; i < 81; i++) {
      resultsA.push(await attemptAs(instructorA));
    }
    const statusesA = resultsA.map((r) => r.status);

    // First 80 succeed, the 81st is throttled — confirms the raised ceiling.
    expect(statusesA.slice(0, 80).every((s) => s === 200)).toBe(true);
    expect(statusesA[80]).toBe(429);

    // Instructor B's very next request still succeeds despite A's bucket
    // being fully exhausted — confirms independent per-instructor quotas
    // (the old IP-keyed limiter would have throttled this too, since both
    // requests come from the same supertest client/IP).
    const resultB = await attemptAs(instructorB);
    expect(resultB.status).toBe(200);
  });
});

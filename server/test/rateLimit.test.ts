import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// The rate limiters in middleware/security.ts are module-level singletons —
// this file gets its own fresh module registry (fileParallelism: false +
// vitest's default per-file isolation), so the counts below start at zero
// and don't leak into/from other test files.
const app = createApp();

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
});

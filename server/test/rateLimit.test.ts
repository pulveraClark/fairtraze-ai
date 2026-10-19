import express from "express";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { authenticateToken } from "../src/middleware/auth.js";
import { analysisLimiter, globalLimiter, globalLimiterKey, trustProxyHops } from "../src/middleware/security.js";
import { createUser } from "./factories.js";
import jwt from "jsonwebtoken";
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

  // ── Sign-in limits (per account + IP backstop), register, forgot-password, trust proxy ──────────────────
  // These tests use their own app with TRUST_PROXY_HOPS=1 and a distinct X-Forwarded-For address each, so every
  // test has its own IP buckets and none of them touches the 127.0.0.1 bucket used by the tests above.
  describe("auth limits", () => {
    function proxiedApp() {
      const before = process.env.TRUST_PROXY_HOPS;
      process.env.TRUST_PROXY_HOPS = "1";
      try { return createApp(); } finally { if (before === undefined) delete process.env.TRUST_PROXY_HOPS; else process.env.TRUST_PROXY_HOPS = before; }
    }
    const proxied = proxiedApp();
    const login = (ip: string, email: string, password = "wrong-password") =>
      request(proxied).post("/api/auth/login").set("X-Forwarded-For", ip).send({ email, password });

    it("two different emails from one IP do not share a failed-sign-in bucket", async () => {
      for (let i = 0; i < 10; i++) expect((await login("10.0.0.1", "a@example.com")).status).toBe(401);
      expect((await login("10.0.0.1", "a@example.com")).status).toBe(429);
      // a classmate on the same Wi-Fi, a different account: still normal
      expect((await login("10.0.0.1", "b@example.com")).status).toBe(401);
    });

    it("the same email from a different IP is a different bucket (keyed by the forwarded address)", async () => {
      for (let i = 0; i < 10; i++) await login("10.0.0.2", "c@example.com");
      expect((await login("10.0.0.2", "c@example.com")).status).toBe(429);
      expect((await login("10.0.0.3", "c@example.com")).status).toBe(401);
    });

    it("successful sign-ins do not use up the allowance", async () => {
      const { user } = await createUser({ email: "ok-user@example.com", password: "password123" });
      for (let i = 0; i < 12; i++) {
        const res = await login("10.0.0.4", user.email, "password123");
        expect(res.status).toBe(200);
      }
    });

    it("an IP-wide backstop stops guessing across many emails (100 failures per 15 min)", async () => {
      for (let i = 0; i < 100; i++) expect((await login("10.0.0.5", `guess${i}@example.com`)).status).toBe(401);
      expect((await login("10.0.0.5", "guess-new@example.com")).status).toBe(429);
      expect((await login("10.0.0.6", "guess-new@example.com")).status).toBe(401); // other visitors unaffected
    });

    it("register allows 30 per hour per IP, then throttles", async () => {
      const reg = () => request(proxied).post("/api/auth/register").set("X-Forwarded-For", "10.0.0.7").send({});
      for (let i = 0; i < 30; i++) expect((await reg()).status).toBe(400);
      expect((await reg()).status).toBe(429);
    });

    it("forgot-password allows 5 per hour for the same email and IP", async () => {
      const ask = (email: string) => request(proxied).post("/api/auth/forgot-password").set("X-Forwarded-For", "10.0.0.8").send({ email });
      for (let i = 0; i < 5; i++) expect((await ask("nobody-here@example.com")).status).toBe(200);
      expect((await ask("nobody-here@example.com")).status).toBe(429);
      expect((await ask("someone-else@example.com")).status).toBe(200);
    });
  });

  describe("trustProxyHops", () => {
    it("is 0 unless set to a small whole number", () => {
      expect(trustProxyHops({})).toBe(0);
      expect(trustProxyHops({ TRUST_PROXY_HOPS: "1" })).toBe(1);
      expect(trustProxyHops({ TRUST_PROXY_HOPS: "2" })).toBe(2);
      expect(trustProxyHops({ TRUST_PROXY_HOPS: "abc" })).toBe(0);
      expect(trustProxyHops({ TRUST_PROXY_HOPS: "-1" })).toBe(0);
      expect(trustProxyHops({ TRUST_PROXY_HOPS: "1.5" })).toBe(0);
      expect(trustProxyHops({ TRUST_PROXY_HOPS: "99" })).toBe(0);
    });
  });

  describe("globalLimiter", () => {
    const globalApp = express();
    globalApp.use(globalLimiter);
    globalApp.get("/probe", (_req, res) => { res.json({ ok: true }); });

    it("keys by user id when a valid token is sent, by IP otherwise", () => {
      const withToken = { headers: { authorization: `Bearer ${tokenFor(920001)}` }, ip: "1.2.3.4" } as never;
      const badToken = { headers: { authorization: "Bearer not-a-token" }, ip: "1.2.3.4" } as never;
      const anonymous = { headers: {}, ip: "1.2.3.4" } as never;
      expect(globalLimiterKey(withToken)).toBe("user:920001");
      expect(globalLimiterKey(badToken)).toBe("1.2.3.4");
      expect(globalLimiterKey(anonymous)).toBe("1.2.3.4");
    });

    it("never keys by a token that did not pass full verification (same check as authenticateToken)", () => {
      const ip = "5.6.7.8";
      const key = (token: string) => globalLimiterKey({ headers: { authorization: `Bearer ${token}` }, ip } as never);
      const payload = { sub: 999001, email: "x@example.com", name: "X", role: "INSTRUCTOR" };

      // Signed with a different secret: decodes fine, must not be trusted.
      expect(key(jwt.sign(payload, "some-other-secret", { expiresIn: "15m" }))).toBe(ip);
      // Expired.
      expect(key(jwt.sign(payload, process.env.AUTH_SECRET as string, { expiresIn: -10 }))).toBe(ip);
      // alg "none" (unsigned) with the claims in place.
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      expect(key(`${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`)).toBe(ip);
      // Valid header and payload with the signature tampered.
      const good = tokenFor(999001);
      const [h, p, sig] = good.split(".");
      expect(key(`${h}.${b64({ ...payload, sub: 1 })}.${sig}`)).toBe(ip);
      // Control: the genuine token is keyed by user.
      expect(key(good)).toBe("user:999001");
      expect(p).toBeTruthy();
    });

    it("allows 1000 requests per user per window; another user on the same IP is not affected", async () => {
      const a = tokenFor(920002);
      const b = tokenFor(920003);
      const hit = (token: string) => request(globalApp).get("/probe").set("Authorization", `Bearer ${token}`);
      let lastOk = 0;
      for (let i = 0; i < 1000; i++) { const r = await hit(a); if (r.status === 200) lastOk++; }
      expect(lastOk).toBe(1000);
      expect((await hit(a)).status).toBe(429);
      expect((await hit(b)).status).toBe(200);
    }, 120_000);
  });
});

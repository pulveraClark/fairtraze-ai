import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createUser } from "./factories.js";

// Not a rate-limit test: pass the auth limiter through (same as resetTokenAtomic.test.ts).
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>("../src/middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const { issueVerificationToken } = await import("../src/lib/emailVerification.js");
const app = createApp();

const USED = "This link expired or was already used.";
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

describe("verification link: atomic use and read-only check", () => {
  // AUTH-30
  it("two simultaneous verifies with the same token: exactly one 200, one 400, no 500", async () => {
    const { user } = await createUser({ email: "vrace@example.com", emailVerified: false });
    const rawToken = await issueVerificationToken(user.id);

    const results = await Promise.all([
      request(app).post("/api/auth/verify-email").send({ token: rawToken }),
      request(app).post("/api/auth/verify-email").send({ token: rawToken }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.status === 400)!.body.error).toBe(USED);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(true);
  });

  // AUTH-31
  it("the check route answers { valid } the same way for unknown, used and expired links and changes nothing", async () => {
    const { user } = await createUser({ email: "vcheck@example.com", emailVerified: false });
    const good = await issueVerificationToken(user.id);

    const valid = await request(app).get("/api/auth/verify-email/check").query({ token: good });
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({ valid: true });
    // Read-only: asking twice still works, the row and the user are untouched.
    expect((await request(app).get("/api/auth/verify-email/check").query({ token: good })).body).toEqual({ valid: true });
    expect(await prisma.emailVerificationToken.count({ where: { tokenHash: hash(good) } })).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(false);

    await prisma.emailVerificationToken.update({ where: { tokenHash: hash(good) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(app).get("/api/auth/verify-email/check").query({ token: good });

    const used = await issueVerificationToken(user.id);
    await request(app).post("/api/auth/verify-email").send({ token: used });
    const usedCheck = await request(app).get("/api/auth/verify-email/check").query({ token: used });

    const unknown = await request(app).get("/api/auth/verify-email/check").query({ token: "nope" });
    const missing = await request(app).get("/api/auth/verify-email/check");

    for (const r of [expired, usedCheck, unknown, missing]) {
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ valid: false });
    }
  });

  // AUTH-37
  it("a deactivated or deleted account is never marked verified (same 400 answer)", async () => {
    const { user: inactive } = await createUser({ email: "vinactive@example.com", emailVerified: false });
    await prisma.user.update({ where: { id: inactive.id }, data: { active: false } });
    const t1 = await issueVerificationToken(inactive.id);
    const r1 = await request(app).post("/api/auth/verify-email").send({ token: t1 });
    expect(r1.status).toBe(400);
    expect(r1.body.error).toBe(USED);
    expect((await prisma.user.findUnique({ where: { id: inactive.id } }))?.emailVerified).toBe(false);

    const { user: gone } = await createUser({ email: "vgone@example.com", emailVerified: false });
    await prisma.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const t2 = await issueVerificationToken(gone.id);
    const r2 = await request(app).post("/api/auth/verify-email").send({ token: t2 });
    expect(r2.status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: gone.id } }))?.emailVerified).toBe(false);
  });

  // AUTH-32
  it("issuing a new link deletes the older ones (one live link)", async () => {
    const { user } = await createUser({ email: "vone@example.com", emailVerified: false });
    const first = await issueVerificationToken(user.id);
    const second = await issueVerificationToken(user.id);

    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
    expect((await request(app).get("/api/auth/verify-email/check").query({ token: first })).body).toEqual({ valid: false });
    expect((await request(app).get("/api/auth/verify-email/check").query({ token: second })).body).toEqual({ valid: true });
  });
});

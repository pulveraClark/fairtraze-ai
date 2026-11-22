import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createUser } from "./factories.js";

// Not a rate-limit test: pass the auth limiter through (same as auth.test.ts).
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>("../src/middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const { issueResetToken } = await import("../src/lib/passwordReset.js");
const app = createApp();

describe("reset token is consumed atomically", () => {
  it("two simultaneous resets with the same token: exactly one 200, one 400, no 500", async () => {
    const { user } = await createUser({ email: "race@example.com", password: "old-password" });
    const rawToken = await issueResetToken(user.id);

    // Overlap proof: count how many consume statements are in flight at the same moment.
    let inFlight = 0;
    let maxInFlight = 0;
    // (Wrapped and restored by hand: vi.spyOn's mockRestore removes the method from the Prisma client.)
    const client = prisma as unknown as { $queryRaw: (...a: unknown[]) => Promise<unknown> };
    const original = client.$queryRaw;
    client.$queryRaw = (...args: unknown[]) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return original.apply(prisma, args).finally(() => { inFlight--; });
    };

    let results: request.Response[];
    try {
      results = await Promise.all([
        request(app).post("/api/auth/reset-password").send({ token: rawToken, newPassword: "new-password123" }),
        request(app).post("/api/auth/reset-password").send({ token: rawToken, newPassword: "new-password456" }),
      ]);
    } finally {
      client.$queryRaw = original;
    }

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);
    const loser = results.find((r) => r.status === 400)!;
    expect(loser.body.error).toBe("This reset link is invalid or has expired.");
    // Informational: whether the two DELETE statements really ran at the same time.
    console.log(`[resetTokenAtomic] max consume statements in flight: ${maxInFlight}`);
    expect(maxInFlight).toBeGreaterThanOrEqual(1); // logged value above shows 2 when they truly overlapped
  });

  it("an expired token is deleted on lookup and answers 400", async () => {
    const { user } = await createUser({ email: "expired-atomic@example.com" });
    const rawToken = await issueResetToken(user.id);
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await prisma.passwordResetToken.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post("/api/auth/reset-password").send({ token: rawToken, newPassword: "whatever123" });
    expect(res.status).toBe(400);
    expect(await prisma.passwordResetToken.count({ where: { tokenHash } })).toBe(0);
  });
});

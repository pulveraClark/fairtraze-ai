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

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

describe("one valid reset token per user", () => {
  it("two simultaneous issueResetToken calls leave exactly one row; only that token works", async () => {
    const { user } = await createUser({ email: "single@example.com", password: "old-password" });

    // Overlap proof: count transactions that are open at the same moment.
    let open = 0;
    let maxOpen = 0;
    const client = prisma as unknown as { $transaction: (...a: unknown[]) => Promise<unknown> };
    const original = client.$transaction;
    client.$transaction = (...args: unknown[]) => {
      open++;
      maxOpen = Math.max(maxOpen, open);
      return original.apply(prisma, args).finally(() => { open--; });
    };

    let tokens: string[];
    try {
      tokens = await Promise.all([issueResetToken(user.id), issueResetToken(user.id)]);
    } finally {
      client.$transaction = original;
    }
    console.log(`[resetTokenSingle] max transactions open at once: ${maxOpen}`);

    const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);

    const surviving = tokens.filter((t) => hash(t) === rows[0].tokenHash);
    const dead = tokens.filter((t) => hash(t) !== rows[0].tokenHash);
    expect(surviving).toHaveLength(1);

    const bad = await request(app).post("/api/auth/reset-password").send({ token: dead[0], newPassword: "new-password123" });
    expect(bad.status).toBe(400);
    const good = await request(app).post("/api/auth/reset-password").send({ token: surviving[0], newPassword: "new-password123" });
    expect(good.status).toBe(200);
  });

  it("two simultaneous forgot-password requests also leave exactly one token", async () => {
    const { user } = await createUser({ email: "single2@example.com" });
    await Promise.all([
      request(app).post("/api/auth/forgot-password").send({ email: "single2@example.com" }),
      request(app).post("/api/auth/forgot-password").send({ email: "single2@example.com" }),
    ]);
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });
});

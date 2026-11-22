import { describe, it, expect } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { issueResetToken } from "../src/lib/passwordReset.js";
import { createUser } from "./factories.js";

// Real limiters on purpose (the limiter case below). Each case uses its own forwarded address.
function proxiedApp() {
  const before = process.env.TRUST_PROXY_HOPS;
  process.env.TRUST_PROXY_HOPS = "1";
  try { return createApp(); } finally { if (before === undefined) delete process.env.TRUST_PROXY_HOPS; else process.env.TRUST_PROXY_HOPS = before; }
}
const app = proxiedApp();

const check = (token: string, ip: string) =>
  request(app).get("/api/auth/reset-password/check").query({ token }).set("X-Forwarded-For", ip);
const reset = (token: string, ip: string) =>
  request(app).post("/api/auth/reset-password").set("X-Forwarded-For", ip).send({ token, newPassword: "new-password123" });

describe("GET /api/auth/reset-password/check", () => {
  it("valid link: true; after the reset (200) the same link checks false", async () => {
    const { user } = await createUser({ email: "chk1@example.com" });
    const token = await issueResetToken(user.id);

    const before = await check(token, "10.10.0.1");
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ valid: true });

    expect((await reset(token, "10.10.0.1")).status).toBe(200);

    const after = await check(token, "10.10.0.1");
    expect(after.body).toEqual({ valid: false });
  });

  it("checking does not consume the link: two checks, then the reset still works", async () => {
    const { user } = await createUser({ email: "chk2@example.com" });
    const token = await issueResetToken(user.id);

    expect((await check(token, "10.10.0.2")).body).toEqual({ valid: true });
    expect((await check(token, "10.10.0.2")).body).toEqual({ valid: true });
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);

    expect((await reset(token, "10.10.0.2")).status).toBe(200);
  });

  it("unknown, empty and missing tokens answer the same { valid: false }", async () => {
    const unknown = await check("not-a-real-token", "10.10.0.3");
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ valid: false });
    expect((await check("", "10.10.0.3")).body).toEqual({ valid: false });
    const missing = await request(app).get("/api/auth/reset-password/check").set("X-Forwarded-For", "10.10.0.3");
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual({ valid: false });
  });

  it("an expired token answers false and is left untouched (read-only)", async () => {
    const { user } = await createUser({ email: "chk3@example.com" });
    const token = await issueResetToken(user.id);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.passwordResetToken.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await check(token, "10.10.0.4")).body).toEqual({ valid: false });
    expect(await prisma.passwordResetToken.count({ where: { tokenHash } })).toBe(1);
  });

  it("allows 30 checks per 15 minutes per address, then 429; another address and the reset limiter are unaffected", async () => {
    for (let i = 0; i < 30; i++) expect((await check("nope", "10.10.0.5")).status).toBe(200);
    expect((await check("nope", "10.10.0.5")).status).toBe(429);
    expect((await check("nope", "10.10.0.6")).status).toBe(200);
    // the reset bucket for the same address is separate
    expect((await reset("nope", "10.10.0.5")).status).toBe(400);
  });
});

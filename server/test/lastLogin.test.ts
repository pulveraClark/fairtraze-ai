import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser } from "./factories.js";
import { recordSessionRefresh, LAST_LOGIN_REFRESH_THROTTLE_MS } from "../src/lib/lastLogin.js";

const app = createApp();
const lastLogin = async (id: number) => (await prisma.user.findUnique({ where: { id }, select: { lastLoginAt: true } }))!.lastLoginAt;

describe("User.lastLoginAt", () => {
  it("is set by a successful sign-in, and not by a failed or deactivated one", async () => {
    const { user } = await createUser({ email: "lastlogin-ok@example.com", password: "correct-password" });
    const { user: off } = await createUser({ email: "lastlogin-off@example.com", password: "correct-password", active: false });
    expect(await lastLogin(user.id)).toBeNull();

    await request(app).post("/api/auth/login").send({ email: "lastlogin-ok@example.com", password: "wrong" });
    expect(await lastLogin(user.id)).toBeNull();

    await request(app).post("/api/auth/login").send({ email: "lastlogin-off@example.com", password: "correct-password" });
    expect(await lastLogin(off.id)).toBeNull();

    const res = await request(app).post("/api/auth/login").send({ email: "lastlogin-ok@example.com", password: "correct-password" });
    expect(res.status).toBe(200);
    expect(Date.now() - (await lastLogin(user.id))!.getTime()).toBeLessThan(60_000);
  });

  it("session refresh writes when unset or stale, but not more than once an hour", async () => {
    const { user } = await createUser();
    const now = new Date();

    await recordSessionRefresh(user.id, now);
    expect((await lastLogin(user.id))!.getTime()).toBe(now.getTime());

    await recordSessionRefresh(user.id, new Date(now.getTime() + 5 * 60_000));
    expect((await lastLogin(user.id))!.getTime()).toBe(now.getTime());

    const later = new Date(now.getTime() + LAST_LOGIN_REFRESH_THROTTLE_MS + 1000);
    await recordSessionRefresh(user.id, later);
    expect((await lastLogin(user.id))!.getTime()).toBe(later.getTime());
  });
});

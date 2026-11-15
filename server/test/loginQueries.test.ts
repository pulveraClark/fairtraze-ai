import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser } from "./factories.js";

vi.hoisted(() => { process.env.REQUEST_TIMING_LOG = "on"; });

// Characterisation test for POST /api/auth/login: responses, stored state and the number of Prisma operations
// (q= in the timing log). Written green on the code BEFORE E1-6, and it must stay green after.

const app = createApp();
const GENERIC_401 = { error: "Invalid email or password" };
const INACTIVE_403 = { error: "Your account has been deactivated. Contact an administrator." };

const login = (email: string, password: string) => request(app).post("/api/auth/login").send({ email, password });
const row = (id: number) => prisma.user.findUniqueOrThrow({ where: { id }, select: { failedLoginAttempts: true, lockedUntil: true, lastLoginAt: true } });
const tokens = (userId: number) => prisma.refreshToken.count({ where: { userId } });

/** Runs a request and returns its Prisma operation count and the bcrypt= number from the timing line. */
async function timed(fn: () => Promise<request.Response>): Promise<{ res: request.Response; q: number; bcrypt: number | null }> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((l: unknown) => { lines.push(String(l)); });
  let res!: request.Response;
  try { res = await fn(); await new Promise((r) => setTimeout(r, 30)); } finally { spy.mockRestore(); }
  const line = lines.find((l) => l.startsWith("[timing]")) ?? "";
  const q = Number(line.match(/ q=(\d+)/)?.[1]);
  const b = line.match(/ bcrypt=(\d+)ms/)?.[1];
  return { res, q, bcrypt: b === undefined ? null : Number(b) };
}

describe("POST /api/auth/login: successful sign-in", () => {
  it("answers the same body, sets the refresh cookie, stores one refresh token, sets lastLoginAt and clean counters", async () => {
    const { user, password } = await createUser({ systemRole: "STUDENT" });
    expect((await row(user.id)).lastLoginAt).toBeNull();
    const res = await login(user.email, password);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["emailEnabled", "emailVerificationRequired", "token", "user"]);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email, name: user.name, systemRole: "STUDENT" });
    expect(res.headers["set-cookie"]?.length).toBeGreaterThan(0);
    expect(await tokens(user.id)).toBe(1);
    const r = await row(user.id);
    expect(Date.now() - r.lastLoginAt!.getTime()).toBeLessThan(60_000);
    expect(r.failedLoginAttempts).toBe(0);
    expect(r.lockedUntil).toBeNull();
  });

  it("a clean account: counters stay 0 and each sign-in adds exactly one refresh token", async () => {
    const { user, password } = await createUser();
    await login(user.email, password);
    await login(user.email, password);
    expect(await tokens(user.id)).toBe(2);
    expect((await row(user.id)).failedLoginAttempts).toBe(0);
  });

  it("counters are reset after earlier failed attempts", async () => {
    const { user, password } = await createUser();
    for (let i = 0; i < 3; i++) expect((await login(user.email, "wrong")).status).toBe(401);
    expect((await row(user.id)).failedLoginAttempts).toBe(3);
    const res = await login(user.email, password);
    expect(res.status).toBe(200);
    const r = await row(user.id);
    expect(r.failedLoginAttempts).toBe(0);
    expect(r.lockedUntil).toBeNull();
    expect(r.lastLoginAt).not.toBeNull();
  });

  it("an EXPIRED lock is cleared by a correct password", async () => {
    const { user, password } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 6, lockedUntil: new Date(Date.now() - 60_000) } });
    const res = await login(user.email, password);
    expect(res.status).toBe(200);
    const r = await row(user.id);
    expect(r.failedLoginAttempts).toBe(0);
    expect(r.lockedUntil).toBeNull();
  });
});

describe("POST /api/auth/login: failures keep their messages and state", () => {
  it("wrong password: generic 401, attempts +1, no lastLoginAt, no refresh token", async () => {
    const { user } = await createUser();
    const res = await login(user.email, "wrong");
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
    const r = await row(user.id);
    expect(r.failedLoginAttempts).toBe(1);
    expect(r.lastLoginAt).toBeNull();
    expect(await tokens(user.id)).toBe(0);
  });

  it("unknown email and a malformed body", async () => {
    const unknown = await login("nobody-here@example.com", "whatever1");
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(GENERIC_401);
    const bad = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Invalid input");
  });

  it("the 6th wrong password locks the account; while locked even the right password gets the same generic 401", async () => {
    const { user, password } = await createUser();
    for (let i = 0; i < 6; i++) expect((await login(user.email, "wrong")).body).toEqual(GENERIC_401);
    const locked = await row(user.id);
    expect(locked.failedLoginAttempts).toBe(6);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const res = await login(user.email, password);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
    expect((await row(user.id)).lastLoginAt).toBeNull();
    expect(await tokens(user.id)).toBe(0);
  });

  it("deactivated account with the right password: the 403 message, no lastLoginAt, no refresh token", async () => {
    const { user, password } = await createUser({ active: false });
    const res = await login(user.email, password);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(INACTIVE_403);
    expect((await row(user.id)).lastLoginAt).toBeNull();
    expect(await tokens(user.id)).toBe(0);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("deactivated account that had failed attempts: counters are still reset (as before), message unchanged", async () => {
    const { user, password } = await createUser({ active: false });
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 4 } });
    const res = await login(user.email, password);
    expect(res.status).toBe(403);
    expect(res.body).toEqual(INACTIVE_403);
    expect((await row(user.id)).failedLoginAttempts).toBe(0);
    expect((await row(user.id)).lastLoginAt).toBeNull();
  });

  it("deactivated account with a wrong password: generic 401 (does not reveal the account state)", async () => {
    const { user } = await createUser({ active: false });
    const res = await login(user.email, "wrong");
    expect(res.status).toBe(401);
    expect(res.body).toEqual(GENERIC_401);
  });
});

describe("POST /api/auth/login: Prisma operations (q=) and bcrypt time in the timing log", () => {
  it("successful sign-in, clean account", async () => {
    const { user, password } = await createUser();
    const t = await timed(() => login(user.email, password));
    expect(t.res.status).toBe(200);
    expect(t.bcrypt).not.toBeNull(); // a number of ms, printed for the login route only
    expect(t.q).toBe(Q.success);
  });

  it("successful sign-in, account with earlier failed attempts", async () => {
    const { user, password } = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 2 } });
    const t = await timed(() => login(user.email, password));
    expect(t.res.status).toBe(200);
    expect(t.q).toBe(Q.successDirty);
  });

  it("wrong password", async () => {
    const { user } = await createUser();
    const t = await timed(() => login(user.email, "wrong"));
    expect(t.res.status).toBe(401);
    expect(t.q).toBe(Q.wrong);
  });

  it("deactivated, right password, clean counters", async () => {
    const { user, password } = await createUser({ active: false });
    const t = await timed(() => login(user.email, password));
    expect(t.res.status).toBe(403);
    expect(t.q).toBe(Q.inactive);
  });
});

const Q = { success: 3, successDirty: 3, wrong: 2, inactive: 1 }; // after E1-6 (was 4, 4, 2, 2)

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function seed() {
  const tag = `Flt${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const recent = (await createUser({ name: `${tag} Bravo`, systemRole: "STUDENT" })).user;
  const month = (await createUser({ name: `${tag} Alpha`, systemRole: "INSTRUCTOR" })).user;
  const never = (await createUser({ name: `${tag} Charlie`, systemRole: "STUDENT", active: false })).user;
  await prisma.user.update({ where: { id: recent.id }, data: { lastLoginAt: daysAgo(2) } });
  await prisma.user.update({ where: { id: month.id }, data: { lastLoginAt: daysAgo(20) } });
  const list = (query: Record<string, string>) =>
    request(app).get("/api/admin/users").query({ search: tag, ...query }).set("Authorization", authHeaderFor(admin));
  return { tag, admin, recent, month, never, list };
}

const ids = (body: { users: { id: number }[] }) => body.users.map((u) => u.id);

describe("GET /api/admin/users filters and sort", () => {
  it("filters by status", async () => {
    const { recent, month, never, list } = await seed();
    expect(ids((await list({ status: "inactive" })).body)).toEqual([never.id]);
    expect(ids((await list({ status: "active" })).body).sort()).toEqual([recent.id, month.id].sort());
  });

  it("filters by last active: 7 days, 30 days, never", async () => {
    const { recent, month, never, list } = await seed();
    expect(ids((await list({ lastActive: "7d" })).body)).toEqual([recent.id]);
    expect(ids((await list({ lastActive: "30d" })).body).sort()).toEqual([recent.id, month.id].sort());
    expect(ids((await list({ lastActive: "never" })).body)).toEqual([never.id]);
  });

  it("combines filters (role + last active)", async () => {
    const { month, list } = await seed();
    expect(ids((await list({ role: "INSTRUCTOR", lastActive: "30d" })).body)).toEqual([month.id]);
  });

  it("sorts by name, joined and last active (never last), both directions", async () => {
    const { recent, month, never, list } = await seed();
    expect(ids((await list({ sort: "name" })).body)).toEqual([month.id, recent.id, never.id]);
    expect(ids((await list({ sort: "name", dir: "desc" })).body)).toEqual([never.id, recent.id, month.id]);
    expect(ids((await list({ sort: "lastActive" })).body)).toEqual([recent.id, month.id, never.id]);
    expect(ids((await list({ sort: "lastActive", dir: "asc" })).body)).toEqual([month.id, recent.id, never.id]);
    // joined, newest first by default
    expect(ids((await list({ sort: "joined" })).body)).toEqual([never.id, month.id, recent.id]);
  });

  it("ignores unknown sort/filter values instead of failing", async () => {
    const { list } = await seed();
    const res = await list({ sort: "passwordHash", status: "bogus", lastActive: "1y" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it("returns lastLoginAt per user and never the password hash", async () => {
    const { recent, list } = await seed();
    const row = (await list({ lastActive: "7d" })).body.users.find((u: { id: number }) => u.id === recent.id);
    expect(row.lastLoginAt).toBeTruthy();
    expect(row.passwordHash).toBeUndefined();
  });
});

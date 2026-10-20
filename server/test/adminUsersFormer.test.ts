import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

async function setup() {
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const { user: current } = await createUser({ systemRole: "STUDENT", name: "Formerlist Current" });
  const { user: former } = await createUser({ systemRole: "STUDENT", name: "Formerlist Gone", active: false });
  await prisma.user.update({ where: { id: former.id }, data: { deletedAt: new Date() } });
  return { admin, current, former };
}

const ids = (body: { users: { id: number }[] }) => body.users.map((u) => u.id);

describe("GET /api/admin/users former members", () => {
  it("excludes anonymised former members by default and counts only what is shown", async () => {
    const { admin, current, former } = await setup();

    const res = await request(app)
      .get("/api/admin/users")
      .query({ search: "Formerlist" })
      .set("Authorization", authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(ids(res.body)).toContain(current.id);
    expect(ids(res.body)).not.toContain(former.id);
    expect(res.body.total).toBe(1);
    expect(res.body.formerCount).toBe(1);
  });

  it("includes them with includeFormer=true, flagged by deletedAt", async () => {
    const { admin, current, former } = await setup();

    const res = await request(app)
      .get("/api/admin/users")
      .query({ search: "Formerlist", includeFormer: "true" })
      .set("Authorization", authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(expect.arrayContaining([current.id, former.id]));
    expect(res.body.total).toBe(2);
    const row = res.body.users.find((u: { id: number }) => u.id === former.id);
    expect(row.deletedAt).toBeTruthy();
  });

  it("never removes the rows", async () => {
    const { admin, former } = await setup();
    await request(app).get("/api/admin/users").set("Authorization", authHeaderFor(admin));
    expect(await prisma.user.findUnique({ where: { id: former.id } })).not.toBeNull();
  });
});

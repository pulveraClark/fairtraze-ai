import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

const bulk = (admin: Parameters<typeof authHeaderFor>[0], body: unknown) =>
  request(app).post("/api/admin/users/bulk-status").set("Authorization", authHeaderFor(admin)).send(body as object);

const activeOf = async (id: number) => (await prisma.user.findUnique({ where: { id } }))!.active;

describe("POST /api/admin/users/bulk-status", () => {
  it("deactivates the chosen accounts, writes one audit row each, and Undo reverses exactly those", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const a = (await createUser()).user;
    const b = (await createUser()).user;
    const other = (await createUser()).user;

    const res = await bulk(admin, { ids: [a.id, b.id], active: false });
    expect(res.status).toBe(200);
    expect(res.body.updated.sort()).toEqual([a.id, b.id].sort());
    expect(await activeOf(a.id)).toBe(false);
    expect(await activeOf(b.id)).toBe(false);
    expect(await activeOf(other.id)).toBe(true);

    const audit = await prisma.auditLog.findMany({ where: { action: "USER_DEACTIVATED", targetId: { in: [String(a.id), String(b.id)] } } });
    expect(audit).toHaveLength(2);

    const undo = await bulk(admin, { ids: res.body.updated, active: true });
    expect(undo.body.updated.sort()).toEqual([a.id, b.id].sort());
    expect(await activeOf(a.id)).toBe(true);
    expect(await activeOf(b.id)).toBe(true);
  });

  it("never includes the caller or former members, and skips accounts already in that state", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const normal = (await createUser()).user;
    const former = (await createUser()).user;
    await prisma.user.update({ where: { id: former.id }, data: { deletedAt: new Date() } });
    const already = (await createUser({ active: false })).user;

    const res = await bulk(admin, { ids: [admin.id, normal.id, former.id, already.id, 99999999], active: false });
    expect(res.status).toBe(200);
    expect(res.body.updated).toEqual([normal.id]);
    expect(res.body.skipped).toEqual(expect.arrayContaining([
      { id: admin.id, reason: "self" },
      { id: former.id, reason: "former" },
      { id: already.id, reason: "unchanged" },
      { id: 99999999, reason: "not_found" },
    ]));
    expect(await activeOf(admin.id)).toBe(true);
    expect((await prisma.user.findUnique({ where: { id: former.id } }))!.active).toBe(true);
  });

  it("validates the list and is admin only", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: student } = await createUser();
    expect((await bulk(admin, { ids: [], active: false })).status).toBe(400);
    expect((await bulk(admin, { ids: Array.from({ length: 101 }, (_, i) => i + 1), active: false })).status).toBe(400);
    expect((await bulk(admin, { ids: ["x"], active: false })).status).toBe(400);
    expect((await bulk(student, { ids: [1], active: false })).status).toBe(403);
  });
});

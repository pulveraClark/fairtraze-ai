import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

const setActive = (admin: Parameters<typeof authHeaderFor>[0], id: number, active: boolean) =>
  request(app).patch(`/api/admin/users/${id}/status`).set("Authorization", authHeaderFor(admin)).send({ active });

describe("deactivate then Undo", () => {
  it("blocks the account immediately, and Undo restores the same session and sign-in cleanly", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: target } = await createUser({ email: "undo-target@example.com", password: "correct-password" });
    const targetAuth = authHeaderFor(target);

    // A live session (refresh token) exists before the deactivation.
    const login = await request(app).post("/api/auth/login").send({ email: "undo-target@example.com", password: "correct-password" });
    expect(login.status).toBe(200);
    const tokensBefore = await prisma.refreshToken.count({ where: { userId: target.id } });
    expect(tokensBefore).toBe(1);
    expect((await request(app).get("/api/alerts/unread-count").set("Authorization", targetAuth)).status).toBe(200);

    expect((await setActive(admin, target.id, false)).status).toBe(200);
    expect((await request(app).get("/api/alerts/unread-count").set("Authorization", targetAuth)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "undo-target@example.com", password: "correct-password" })).status).toBe(403);
    // Deactivating revokes nothing, so there is nothing for Undo to bring back.
    expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBeGreaterThanOrEqual(tokensBefore);

    const undo = await setActive(admin, target.id, true);
    expect(undo.status).toBe(200);
    expect(undo.body.active).toBe(true);
    expect((await request(app).get("/api/alerts/unread-count").set("Authorization", targetAuth)).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ email: "undo-target@example.com", password: "correct-password" })).status).toBe(200);
  });

  it("records both steps in the audit log", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: target } = await createUser();
    await setActive(admin, target.id, false);
    await setActive(admin, target.id, true);
    const rows = await prisma.auditLog.findMany({ where: { targetId: String(target.id) }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["USER_DEACTIVATED", "USER_ACTIVATED"]);
  });

  it("an admin cannot deactivate or change the role of their own account", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    expect((await setActive(admin, admin.id, false)).status).toBe(403);
    const role = await request(app).patch(`/api/admin/users/${admin.id}/role`).set("Authorization", authHeaderFor(admin)).send({ role: "STUDENT" });
    expect(role.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))!.active).toBe(true);
  });
});

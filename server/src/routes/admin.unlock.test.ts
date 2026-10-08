import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { adminRouter } from "./admin.js";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminRouter);
  return app;
}

async function createUser(email: string, systemRole: "ADMIN" | "INSTRUCTOR" | "STUDENT" = "STUDENT") {
  const passwordHash = await bcrypt.hash("irrelevant-password", 10);
  return prisma.user.create({ data: { email, passwordHash, name: "Locked Student", systemRole, emailVerified: true } });
}

function tokenFor(user: { id: number; email: string; name: string; systemRole: "ADMIN" | "INSTRUCTOR" | "STUDENT" }) {
  return signToken({ sub: user.id, email: user.email, name: user.name, role: user.systemRole });
}

describe("POST /api/admin/users/:id/unlock", () => {
  it("clears failedLoginAttempts/lockedUntil and writes a USER_UNLOCKED audit log entry", async () => {
    const admin = await createUser("admin@example.com", "ADMIN");
    const student = await createUser("student@example.com", "STUDENT");
    await prisma.user.update({
      where: { id: student.id },
      data: { failedLoginAttempts: 6, lockedUntil: new Date(Date.now() + 60 * 1000) },
    });

    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/users/${student.id}/unlock`)
      .set("Authorization", `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.lockedUntil).toBeNull();

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(updated.failedLoginAttempts).toBe(0);
    expect(updated.lockedUntil).toBeNull();

    const logs = await prisma.auditLog.findMany({ where: { targetType: "USER", targetId: String(student.id) } });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("USER_UNLOCKED");
    expect(logs[0].actorId).toBe(admin.id);
    expect(logs[0].details).toBe(student.name);
  });

  it("rejects a non-admin caller", async () => {
    const instructor = await createUser("instructor@example.com", "INSTRUCTOR");
    const student = await createUser("student2@example.com", "STUDENT");

    const app = buildApp();
    const res = await request(app)
      .post(`/api/admin/users/${student.id}/unlock`)
      .set("Authorization", `Bearer ${tokenFor(instructor)}`);

    expect(res.status).toBe(403);
  });

  it("404s for a non-existent user id", async () => {
    const admin = await createUser("admin2@example.com", "ADMIN");

    const app = buildApp();
    const res = await request(app)
      .post("/api/admin/users/999999/unlock")
      .set("Authorization", `Bearer ${tokenFor(admin)}`);

    expect(res.status).toBe(404);
  });
});

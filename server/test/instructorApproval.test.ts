import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

describe("instructor approval", () => {
  it("registers an INSTRUCTOR as pending and a STUDENT as approved", async () => {
    const inst = await request(app).post("/api/auth/register").send({ email: "i@example.com", password: "password123", name: "Ins", role: "INSTRUCTOR" });
    expect(inst.status).toBe(201);
    expect(inst.body.user.instructorStatus).toBe("PENDING");

    const stu = await request(app).post("/api/auth/register").send({ email: "s@example.com", password: "password123", name: "Stu", role: "STUDENT" });
    expect(stu.status).toBe(201);
    expect(stu.body.user.instructorStatus).toBe("APPROVED");
  });

  it("lets a pending instructor log in but blocks instructor routes with 403", async () => {
    const { user, password } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });

    const login = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.instructorStatus).toBe("PENDING");

    const me = await request(app).get("/api/auth/me").set("Authorization", authHeaderFor(user));
    expect(me.status).toBe(200);
    expect(me.body.instructorStatus).toBe("PENDING");

    const res = await request(app).get("/api/classes").set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("INSTRUCTOR_PENDING");
    expect(res.body.error).toMatch(/waiting for admin approval/i);

    const create = await request(app).post("/api/classes").set("Authorization", authHeaderFor(user)).send({});
    expect(create.status).toBe(403);
  });

  it("blocks a rejected instructor with a clear message", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "REJECTED" });
    const res = await request(app).get("/api/classes").set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("INSTRUCTOR_REJECTED");
    expect(res.body.error).toBe("Your instructor request was not approved. Contact your administrator.");
  });

  it("approval takes effect immediately with the same, already-issued token", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const header = authHeaderFor(user); // token issued while still pending

    expect((await request(app).get("/api/classes").set("Authorization", header)).status).toBe(403);

    const approve = await request(app).post(`/api/admin/instructor-approvals/${user.id}/approve`).set("Authorization", authHeaderFor(admin));
    expect(approve.status).toBe(200);

    expect((await request(app).get("/api/classes").set("Authorization", header)).status).toBe(200);

    const audit = await prisma.auditLog.findFirst({ where: { action: "INSTRUCTOR_APPROVED", targetId: String(user.id) } });
    expect(audit?.actorId).toBe(admin.id);
    const alert = await prisma.alert.findFirst({ where: { recipientId: user.id, type: "INSTRUCTOR_APPROVED" } });
    expect(alert).not.toBeNull();
  });

  it("reject blocks the instructor, notifies them, and an admin can re-approve", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const adminHeader = authHeaderFor(admin);

    const reject = await request(app).post(`/api/admin/instructor-approvals/${user.id}/reject`).set("Authorization", adminHeader);
    expect(reject.status).toBe(200);
    expect((await request(app).get("/api/classes").set("Authorization", authHeaderFor(user))).status).toBe(403);
    expect(await prisma.alert.findFirst({ where: { recipientId: user.id, type: "INSTRUCTOR_REJECTED" } })).not.toBeNull();

    // Reject is PENDING-only: a second reject conflicts.
    expect((await request(app).post(`/api/admin/instructor-approvals/${user.id}/reject`).set("Authorization", adminHeader)).status).toBe(409);

    const reapprove = await request(app).post(`/api/admin/instructor-approvals/${user.id}/approve`).set("Authorization", adminHeader);
    expect(reapprove.status).toBe(200);
    expect((await request(app).get("/api/classes").set("Authorization", authHeaderFor(user))).status).toBe(200);
  });

  it("lists pending and recently reviewed instructors for admins", async () => {
    const { user: pending } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });
    const { user: done } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });
    const { user: admin } = await createUser({ systemRole: "ADMIN", name: "Admin Reviewer" });
    const header = authHeaderFor(admin);
    await request(app).post(`/api/admin/instructor-approvals/${done.id}/approve`).set("Authorization", header);

    const res = await request(app).get("/api/admin/instructor-approvals").set("Authorization", header);
    expect(res.status).toBe(200);
    expect(res.body.pendingCount).toBe(1);
    expect(res.body.pending.map((p: { id: number }) => p.id)).toEqual([pending.id]);
    expect(res.body.pending[0].passwordHash).toBeUndefined();
    expect(res.body.recent[0]).toMatchObject({ id: done.id, status: "APPROVED", reviewedByName: "Admin Reviewer" });
  });

  it("leaves students and admins unaffected", async () => {
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    expect((await request(app).get("/api/student/classes").set("Authorization", authHeaderFor(student))).status).toBe(200);
    expect((await request(app).get("/api/admin/overview").set("Authorization", authHeaderFor(admin))).status).toBe(200);
  });

  it("does not let non-admins review or list approvals", async () => {
    const { user: target } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: pendingSelf } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });

    for (const who of [student, otherInstructor, pendingSelf]) {
      const h = authHeaderFor(who);
      expect((await request(app).get("/api/admin/instructor-approvals").set("Authorization", h)).status).toBe(403);
      expect((await request(app).post(`/api/admin/instructor-approvals/${target.id}/approve`).set("Authorization", h)).status).toBe(403);
      expect((await request(app).post(`/api/admin/instructor-approvals/${target.id}/reject`).set("Authorization", h)).status).toBe(403);
    }
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.instructorStatus).toBe("PENDING");
  });

  it("404s when the target is not an instructor", async () => {
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const res = await request(app).post(`/api/admin/instructor-approvals/${student.id}/approve`).set("Authorization", authHeaderFor(admin));
    expect(res.status).toBe(404);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

describe("GET /api/admin/users/:id/details", () => {
  it("returns class and group counts only", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const dept = await prisma.department.create({ data: { name: "Dept Details", code: "DD" } });
    const cls = await prisma.classSection.create({
      data: { subjectCode: "DT101", subjectName: "Details", departmentId: dept.id, instructorId: admin.id },
    });
    await prisma.classEnrollment.create({ data: { userId: student.id, classSectionId: cls.id } });
    const project = await prisma.project.create({ data: { groupName: "G", name: "P", repoUrl: null } });
    await prisma.groupMembership.create({ data: { userId: student.id, projectId: project.id } });

    const res = await request(app).get(`/api/admin/users/${student.id}/details`).set("Authorization", authHeaderFor(admin));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ classCount: 1, groupCount: 1 });

    const owner = await request(app).get(`/api/admin/users/${admin.id}/details`).set("Authorization", authHeaderFor(admin));
    expect(owner.body).toEqual({ classCount: 1, groupCount: 0 });
  });

  it("404s for an unknown user and 403s for non-admins", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    expect((await request(app).get("/api/admin/users/99999999/details").set("Authorization", authHeaderFor(admin))).status).toBe(404);
    expect((await request(app).get(`/api/admin/users/${student.id}/details`).set("Authorization", authHeaderFor(student))).status).toBe(403);
  });
});

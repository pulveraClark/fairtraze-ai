import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection as makeClass } from "./factories.js";

// The class code is optional in the schema, so give each test class its own.
let n = 0;
async function createClassSection(instructorId: number) {
  const cls = await makeClass(instructorId);
  const joinCode = `PRV${Date.now().toString(36).toUpperCase()}${++n}`;
  return prisma.classSection.update({ where: { id: cls.id }, data: { joinCode } });
}

const app = createApp();

describe("GET /api/join/class/:code (invite preview)", () => {
  it("needs a signed-in user", async () => {
    const res = await request(app).get("/api/join/class/ABC123");
    expect(res.status).toBe(401);
  });

  it("returns the class and whether the student is already enrolled, and never enrolls", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cls = await createClassSection(instructor.id);
    const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });

    const before = await request(app).get(`/api/join/class/${cls.joinCode!.toLowerCase()}`).set("Authorization", authHeaderFor(student));
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ classId: cls.id, className: `${cls.subjectCode} — ${cls.subjectName}`, alreadyEnrolled: false });
    expect(await prisma.classEnrollment.count({ where: { userId: student.id } })).toBe(0);

    await prisma.classEnrollment.create({ data: { userId: student.id, classSectionId: cls.id } });
    const after = await request(app).get(`/api/join/class/${cls.joinCode}`).set("Authorization", authHeaderFor(student));
    expect(after.body.alreadyEnrolled).toBe(true);
  });

  it("answers an instructor with alreadyEnrolled false, and an unknown code with 404", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cls = await createClassSection(instructor.id);
    const ok = await request(app).get(`/api/join/class/${cls.joinCode}`).set("Authorization", authHeaderFor(instructor));
    expect(ok.status).toBe(200);
    expect(ok.body.alreadyEnrolled).toBe(false);
    const bad = await request(app).get("/api/join/class/NOPE-NOPE").set("Authorization", authHeaderFor(instructor));
    expect(bad.status).toBe(404);
  });
});

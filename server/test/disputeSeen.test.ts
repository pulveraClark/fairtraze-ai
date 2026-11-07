import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const { createApp } = await import("../src/app.js");
const app = createApp();

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group A" });
  await createMembership(student.id, project.id, "LEADER");
  const dispute = await prisma.dispute.create({
    data: { projectId: project.id, studentUserId: student.id, memberName: student.name, reason: "Offline work", disputedFlags: "[]" },
  });
  return { instructor, student, project, dispute };
}

describe("POST /api/disputes/:id/seen", () => {
  it("starts unseen and the owning instructor marks it seen, once (idempotent), with no alert", async () => {
    const { instructor, dispute } = await setup();
    expect(dispute.seenAt).toBeNull();

    const first = await request(app).post(`/api/disputes/${dispute.id}/seen`).set("Authorization", authHeaderFor(instructor));
    expect(first.status).toBe(200);
    expect(first.body.seenAt).toBeTruthy();

    const second = await request(app).post(`/api/disputes/${dispute.id}/seen`).set("Authorization", authHeaderFor(instructor));
    expect(second.status).toBe(200);
    expect(second.body.seenAt).toBe(first.body.seenAt); // the first time is kept

    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
    expect(row.status).toBe("OPEN"); // seeing it changes nothing else
    expect(row.resolvedAt).toBeNull();
    expect(await prisma.alert.count()).toBe(0);
  });

  it("is owner only: another instructor and any student get 403, a missing id 404", async () => {
    const { student, dispute } = await setup();
    const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });

    const other = await request(app).post(`/api/disputes/${dispute.id}/seen`).set("Authorization", authHeaderFor(otherInstructor));
    expect(other.status).toBe(403);
    const asStudent = await request(app).post(`/api/disputes/${dispute.id}/seen`).set("Authorization", authHeaderFor(student));
    expect(asStudent.status).toBe(403);
    const missing = await request(app).post(`/api/disputes/999999/seen`).set("Authorization", authHeaderFor(otherInstructor));
    expect(missing.status).toBe(404);

    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
    expect(row.seenAt).toBeNull();
  });

  it("the student's own list carries seenAt (null until seen)", async () => {
    const { instructor, student, dispute } = await setup();

    const before = await request(app).get("/api/disputes/mine").set("Authorization", authHeaderFor(student));
    expect(before.status).toBe(200);
    expect(before.body.disputes[0].seenAt).toBeNull();

    await request(app).post(`/api/disputes/${dispute.id}/seen`).set("Authorization", authHeaderFor(instructor));

    const after = await request(app).get("/api/disputes/mine").set("Authorization", authHeaderFor(student));
    expect(after.body.disputes[0].seenAt).toBeTruthy();
  });

  it("replying to an unseen note also sets seenAt, never later than the reply", async () => {
    const { instructor, dispute } = await setup();

    const res = await request(app)
      .post(`/api/disputes/${dispute.id}/resolve`)
      .set("Authorization", authHeaderFor(instructor))
      .send({ status: "DISMISSED", instructorResponse: "Thanks for the context." });
    expect(res.status).toBe(200);

    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
    expect(row.seenAt).not.toBeNull();
    expect(row.resolvedAt).not.toBeNull();
    expect(row.seenAt!.getTime()).toBeLessThanOrEqual(row.resolvedAt!.getTime());
  });

  it("replying keeps an earlier seenAt", async () => {
    const { instructor, dispute } = await setup();
    const earlier = new Date("2026-10-01T00:00:00Z");
    await prisma.dispute.update({ where: { id: dispute.id }, data: { seenAt: earlier } });

    await request(app)
      .post(`/api/disputes/${dispute.id}/resolve`)
      .set("Authorization", authHeaderFor(instructor))
      .send({ status: "RESOLVED", instructorResponse: "Accepted." });

    const row = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } });
    expect(row.seenAt!.toISOString()).toBe(earlier.toISOString());
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id);
  const { user: leader } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  for (const u of [leader, student]) {
    await prisma.classEnrollment.create({ data: { userId: u.id, classSectionId: classSection.id } });
  }
  const groupA = await createProject({ assignmentId: assignment.id, groupName: "Group A" });
  const groupB = await createProject({ assignmentId: assignment.id, groupName: "Group B" });
  await createMembership(leader.id, groupA.id, "LEADER");
  return { assignment, leader, student, groupA, groupB };
}

const send = (user: Parameters<typeof authHeaderFor>[0], projectId: number) =>
  request(app).post(`/api/groups/${projectId}/request`).set("Authorization", authHeaderFor(user)).send({});

const pendingCount = (userId: number) =>
  prisma.groupJoinRequest.count({ where: { userId, status: "PENDING" } });

describe("POST /api/groups/:id/request duplicates", () => {
  it("returns the existing pending request instead of creating another", async () => {
    const { student, groupA } = await setup();
    const first = await send(student, groupA.id);
    expect(first.status).toBe(201);

    const second = await send(student, groupA.id);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.existing).toBe(true);
    expect(await pendingCount(student.id)).toBe(1);

    // the leader was told once, not twice
    const alerts = await prisma.alert.count({ where: { type: "JOIN_REQUEST_RECEIVED", refId: first.body.id } });
    expect(alerts).toBe(1);
  });

  it("creates only one row when requests arrive at the same time", async () => {
    const { student, groupA } = await setup();
    const results = await Promise.all([1, 2, 3, 4].map(() => send(student, groupA.id)));

    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await pendingCount(student.id)).toBe(1);
  });

  it("still refuses a pending request for a different group in the same project", async () => {
    const { student, groupA, groupB } = await setup();
    expect((await send(student, groupA.id)).status).toBe(201);
    const other = await send(student, groupB.id);
    expect(other.status).toBe(409);
    expect(other.body.error).toMatch(/pending request/i);
    expect(await pendingCount(student.id)).toBe(1);
  });

  it("allows a new request after the first was cancelled", async () => {
    const { student, groupA } = await setup();
    const first = await send(student, groupA.id);
    await request(app).post(`/api/groups/requests/${first.body.id}/cancel`).set("Authorization", authHeaderFor(student));
    const again = await send(student, groupA.id);
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(first.body.id);
  });

  it("refuses a full group", async () => {
    const { assignment, student, groupB } = await setup();
    await prisma.assignment.update({ where: { id: assignment.id }, data: { maxGroupSize: 1 } });
    await prisma.member.create({ data: { projectId: groupB.id, studentName: "Existing", githubUsername: "" } });
    const res = await send(student, groupB.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/full/i);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

async function setup(maxGroupSize: number, pendingCount: number) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id);
  await prisma.assignment.update({ where: { id: assignment.id }, data: { maxGroupSize } });
  const group = await createProject({ assignmentId: assignment.id, groupName: "Group A" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  await createMembership(leader.id, group.id, "LEADER");

  const requesters: Array<{ id: number; email: string; name: string; systemRole: "STUDENT" }> = [];
  for (let i = 0; i < pendingCount; i++) {
    const { user } = await createUser({ systemRole: "STUDENT", emailVerified: true });
    await prisma.classEnrollment.create({ data: { userId: user.id, classSectionId: classSection.id } });
    // oldest first: i minutes apart
    await prisma.groupJoinRequest.create({
      data: { userId: user.id, projectId: group.id, status: "PENDING", createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)) },
    });
    requesters.push(user as never);
  }
  return { instructor, leader, group, requesters };
}

const acceptAll = (as: Parameters<typeof authHeaderFor>[0], projectId: number) =>
  request(app).post(`/api/groups/${projectId}/requests/accept-all`).set("Authorization", authHeaderFor(as)).send();

describe("POST /api/groups/:id/requests/accept-all", () => {
  it("accepts every pending request when they all fit", async () => {
    const { leader, group, requesters } = await setup(5, 3);
    const res = await acceptAll(leader, group.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 3, skipped: 0 });

    const memberIds = (await prisma.groupMembership.findMany({ where: { projectId: group.id } })).map((m) => m.userId);
    for (const r of requesters) expect(memberIds).toContain(r.id);
    expect(await prisma.groupJoinRequest.count({ where: { projectId: group.id, status: "PENDING" } })).toBe(0);
    expect(await prisma.alert.count({ where: { type: "JOIN_REQUEST_ACCEPTED", projectId: group.id } })).toBe(3);
  });

  it("stops at the member limit, oldest first, and leaves the rest pending", async () => {
    const { leader, group, requesters } = await setup(3, 4); // leader + 2 free slots
    const res = await acceptAll(leader, group.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accepted: 2, skipped: 2 });

    const members = await prisma.groupMembership.count({ where: { projectId: group.id } });
    expect(members).toBe(3);
    const still = await prisma.groupJoinRequest.findMany({ where: { projectId: group.id, status: "PENDING" }, orderBy: { id: "asc" } });
    expect(still.map((r) => r.userId)).toEqual([requesters[2]!.id, requesters[3]!.id]);
  });

  it("works for the owning instructor too", async () => {
    const { instructor, group } = await setup(5, 2);
    expect((await acceptAll(instructor, group.id)).body.accepted).toBe(2);
  });

  it("refuses a plain member, and an outsider", async () => {
    const { group, requesters } = await setup(5, 2);
    const { user: outsider } = await createUser({ systemRole: "STUDENT", emailVerified: true });
    expect((await acceptAll(requesters[0] as never, group.id)).status).toBe(403);
    expect((await acceptAll(outsider, group.id)).status).toBe(403);
    expect(await prisma.groupJoinRequest.count({ where: { projectId: group.id, status: "PENDING" } })).toBe(2);
  });

  it("answers 409 when the group is already full, or nothing is pending", async () => {
    const full = await setup(1, 2);
    const a = await acceptAll(full.leader, full.group.id);
    expect(a.status).toBe(409);
    expect(a.body.error).toMatch(/full/i);

    const none = await setup(5, 0);
    expect((await acceptAll(none.leader, none.group.id)).status).toBe(409);
  });
});

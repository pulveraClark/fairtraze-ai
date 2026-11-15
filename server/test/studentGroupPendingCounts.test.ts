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
  const assignment = await createAssignment(classSection.id, { sourceType: "GITHUB" });
  const project = await createProject({ assignmentId: assignment.id });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: applicant } = await createUser({ systemRole: "STUDENT" });
  await createMembership(member.id, project.id, "MEMBER");
  await createMembership(leader.id, project.id, "LEADER");
  return { project, member, leader, applicant };
}

const get = (projectId: number, user: Parameters<typeof authHeaderFor>[0]) =>
  request(app).get(`/api/student/group/${projectId}`).set("Authorization", authHeaderFor(user));

describe("GET /api/student/group/:projectId: pendingCounts (leader only)", () => {
  it("the leader gets join-request and role-request counts, pending only", async () => {
    const { project, member, leader, applicant } = await setup();
    await prisma.groupJoinRequest.create({ data: { userId: applicant.id, projectId: project.id, status: "PENDING" } });
    await prisma.groupJoinRequest.create({ data: { userId: member.id, projectId: project.id, status: "DECLINED" } });
    // A change-role request and an add-role request are the same table; both count.
    await prisma.roleSuggestion.create({ data: { userId: member.id, projectId: project.id, suggestedRoles: JSON.stringify(["DOCUMENTATION"]), status: "PENDING" } });
    await prisma.roleSuggestion.create({ data: { userId: leader.id, projectId: project.id, suggestedRoles: JSON.stringify(["DEVELOPER", "DOCUMENTATION"]), status: "PENDING" } });
    await prisma.roleSuggestion.create({ data: { userId: applicant.id, projectId: project.id, suggestedRoles: JSON.stringify(["DEVELOPER"]), status: "ACCEPTED" } });

    const res = await get(project.id, leader);
    expect(res.status).toBe(200);
    expect(res.body.pendingCounts).toEqual({ joinRequests: 1, roleRequests: 2 });
  });

  it("zero when nothing is waiting", async () => {
    const { project, leader } = await setup();
    const res = await get(project.id, leader);
    expect(res.body.pendingCounts).toEqual({ joinRequests: 0, roleRequests: 0 });
  });

  it("a plain member never receives the field", async () => {
    const { project, member, applicant } = await setup();
    await prisma.groupJoinRequest.create({ data: { userId: applicant.id, projectId: project.id, status: "PENDING" } });
    const res = await get(project.id, member);
    expect(res.status).toBe(200);
    expect(res.body.pendingCounts).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("pendingCounts");
  });

  it("counts only this group's requests", async () => {
    const { project, leader, applicant } = await setup();
    const other = await createProject({ assignmentId: project.assignmentId });
    await prisma.groupJoinRequest.create({ data: { userId: applicant.id, projectId: other.id, status: "PENDING" } });
    const res = await get(project.id, leader);
    expect(res.body.pendingCounts.joinRequests).toBe(0);
  });
});

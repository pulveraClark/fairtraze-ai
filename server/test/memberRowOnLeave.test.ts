import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

// When someone leaves or is removed, the legacy Member row created for them goes too, also when they
// have no GitHub username (that row used to stay behind as a permanent 0-commit "ghost" in GitHub-only groups).

const app = createApp();

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType: "GITHUB" });
  const project = await createProject({ assignmentId: assignment.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lead Lopez" });
  await createMembership(leader.id, project.id, "LEADER");
  await prisma.member.create({ data: { projectId: project.id, studentName: "Lead Lopez", githubUsername: "lead-l" } });
  return { instructor, cs, project, leader };
}

async function addMember(projectId: number, name: string, login: string | null, rowLogin: string | null = login) {
  const { user } = await createUser({ systemRole: "STUDENT", name });
  if (login !== null) await prisma.user.update({ where: { id: user.id }, data: { githubUsername: login } });
  await createMembership(user.id, projectId, "MEMBER");
  await prisma.member.create({ data: { projectId, studentName: name, githubUsername: rowLogin ?? "" } });
  return { ...user, githubUsername: login };
}

const remove = (as: Parameters<typeof authHeaderFor>[0], projectId: number, userId: number) =>
  request(app).delete(`/api/groups/${projectId}/members/${userId}`).set("Authorization", authHeaderFor(as));
const rowsOf = async (projectId: number) =>
  (await prisma.member.findMany({ where: { projectId }, orderBy: { id: "asc" } })).map((r) => `${r.studentName}|${r.githubUsername}`);

describe("removing a member deletes their legacy Member row", () => {
  it("with a username: their row goes, others stay", async () => {
    const { instructor, project } = await setup();
    const ana = await addMember(project.id, "Ana Cruz", "ana-c");
    await addMember(project.id, "Ben Lim", "ben-l");
    expect((await remove(instructor, project.id, ana.id)).status).toBe(200);
    expect(await rowsOf(project.id)).toEqual(["Lead Lopez|lead-l", "Ben Lim|ben-l"]);
  });

  it("with a username in a different letter case than the stored one", async () => {
    const { instructor, project } = await setup();
    const ana = await addMember(project.id, "Ana Cruz", "Ana-C", "ana-c");
    expect((await remove(instructor, project.id, ana.id)).status).toBe(200);
    expect(await rowsOf(project.id)).toEqual(["Lead Lopez|lead-l"]);
  });

  it("without a username: their blank row goes; a blank row with another name stays", async () => {
    const { instructor, project } = await setup();
    const ana = await addMember(project.id, "Ana Cruz", null);
    await addMember(project.id, "Cy Dee", null);
    expect((await remove(instructor, project.id, ana.id)).status).toBe(200);
    expect(await rowsOf(project.id)).toEqual(["Lead Lopez|lead-l", "Cy Dee|"]);
  });

  it("two blank members with the same display name: exactly one row (the lowest id) is deleted", async () => {
    const { instructor, project } = await setup();
    const first = await addMember(project.id, "Sam Reyes", null);
    await addMember(project.id, "Sam Reyes", null);
    const before = await prisma.member.findMany({ where: { projectId: project.id, studentName: "Sam Reyes" }, orderBy: { id: "asc" } });
    expect((await remove(instructor, project.id, first.id)).status).toBe(200);
    const after = await prisma.member.findMany({ where: { projectId: project.id, studentName: "Sam Reyes" } });
    expect(after.map((r) => r.id)).toEqual([before[1].id]);
  });

  it("never touches another group's rows, even with the same username or name", async () => {
    const { instructor, project, cs } = await setup();
    const otherAssignment = await createAssignment(cs.id, { sourceType: "GITHUB" });
    const other = await createProject({ assignmentId: otherAssignment.id });
    await prisma.member.create({ data: { projectId: other.id, studentName: "Ana Cruz", githubUsername: "ana-c" } });
    await prisma.member.create({ data: { projectId: other.id, studentName: "Ana Cruz", githubUsername: "" } });
    const withName = await addMember(project.id, "Ana Cruz", "ana-c");
    expect((await remove(instructor, project.id, withName.id)).status).toBe(200);
    expect(await rowsOf(other.id)).toEqual(["Ana Cruz|ana-c", "Ana Cruz|"]);
    const blank = await addMember(project.id, "Ana Cruz", null);
    expect((await remove(instructor, project.id, blank.id)).status).toBe(200);
    expect(await rowsOf(other.id)).toEqual(["Ana Cruz|ana-c", "Ana Cruz|"]);
  });

  it("a member who leaves on their own (no username): same result", async () => {
    const { project } = await setup();
    const ana = await addMember(project.id, "Ana Cruz", null);
    expect((await remove(ana, project.id, ana.id)).status).toBe(200);
    expect(await rowsOf(project.id)).toEqual(["Lead Lopez|lead-l"]);
  });

  it("leaves no surplus: Member rows equal memberships, and the report is marked outdated", async () => {
    const { instructor, project } = await setup();
    const ana = await addMember(project.id, "Ana Cruz", null);
    await addMember(project.id, "Ben Lim", "ben-l");
    await remove(instructor, project.id, ana.id);
    expect(await prisma.member.count({ where: { projectId: project.id } })).toBe(await prisma.groupMembership.count({ where: { projectId: project.id } }));
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).membershipChangedAt).not.toBeNull();
  });
});

describe("leaving the class deletes the legacy Member row", () => {
  it("with no username, inside the same transaction", async () => {
    const { project, cs } = await setup();
    const ana = await addMember(project.id, "Ana Cruz", null);
    await addMember(project.id, "Cy Dee", null);
    await prisma.classEnrollment.create({ data: { userId: ana.id, classSectionId: cs.id } });
    const res = await request(app).delete(`/api/student/classes/${cs.id}/leave`).set("Authorization", authHeaderFor(ana));
    expect(res.status).toBe(200);
    expect(await rowsOf(project.id)).toEqual(["Lead Lopez|lead-l", "Cy Dee|"]);
  });

  it("with a username", async () => {
    const { project, cs } = await setup();
    const ana = await addMember(project.id, "Ana Cruz", "ana-c");
    await prisma.classEnrollment.create({ data: { userId: ana.id, classSectionId: cs.id } });
    const res = await request(app).delete(`/api/student/classes/${cs.id}/leave`).set("Authorization", authHeaderFor(ana));
    expect(res.status).toBe(200);
    expect(await rowsOf(project.id)).toEqual(["Lead Lopez|lead-l"]);
  });
});

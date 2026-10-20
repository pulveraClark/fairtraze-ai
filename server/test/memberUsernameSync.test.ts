import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

async function inGroup(name: string, githubUsername: string | null, memberUsername: string) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType: "GITHUB" });
  const project = await createProject({ assignmentId: assignment.id });
  const { user } = await createUser({ systemRole: "STUDENT", name });
  if (githubUsername !== null) await prisma.user.update({ where: { id: user.id }, data: { githubUsername } });
  await createMembership(user.id, project.id, "LEADER");
  await prisma.member.create({ data: { projectId: project.id, studentName: name, githubUsername: memberUsername } });
  return { user, project };
}
const patch = (u: Parameters<typeof authHeaderFor>[0], body: object) =>
  request(app).patch("/api/users/me").set("Authorization", authHeaderFor(u)).send(body);
const memberRow = (projectId: number) => prisma.member.findFirstOrThrow({ where: { projectId } });

describe("saving a GitHub username syncs Member rows", () => {
  it("fills an empty row for the user's group", async () => {
    const { user, project } = await inGroup("Ana Cruz", null, "");
    expect((await patch(user, { githubUsername: "ana-c" })).status).toBe(200);
    expect((await memberRow(project.id)).githubUsername).toBe("ana-c");
  });

  it("changes a row that held the old username, in every group the user belongs to", async () => {
    const a = await inGroup("Ana Cruz", "old-ana", "old-ana");
    const other = await createProject({ assignmentId: a.project.assignmentId });
    await createMembership(a.user.id, other.id, "MEMBER");
    await prisma.member.create({ data: { projectId: other.id, studentName: "Ana Cruz", githubUsername: "OLD-ana" } });
    await patch(a.user, { githubUsername: "new-ana" });
    expect((await memberRow(a.project.id)).githubUsername).toBe("new-ana");
    expect((await memberRow(other.id)).githubUsername).toBe("new-ana");
  });

  it("can clear the username", async () => {
    const { user, project } = await inGroup("Ana Cruz", "ana-c", "ana-c");
    await patch(user, { githubUsername: null });
    expect((await memberRow(project.id)).githubUsername).toBe("");
  });

  it("leaves other people's rows alone", async () => {
    const { user, project } = await inGroup("Ana Cruz", null, "");
    await prisma.member.create({ data: { projectId: project.id, studentName: "Ben Lim", githubUsername: "ben" } });
    await prisma.member.create({ data: { projectId: project.id, studentName: "Cy Dee", githubUsername: "" } });
    await patch(user, { githubUsername: "ana-c" });
    const rows = await prisma.member.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.githubUsername)).toEqual(["ana-c", "ben", ""]);
  });

  it("a name-only change touches no Member row", async () => {
    const { user, project } = await inGroup("Ana Cruz", "ana-c", "ana-c");
    await patch(user, { name: "Ana C. Cruz" });
    expect((await memberRow(project.id)).githubUsername).toBe("ana-c");
  });
});

describe("migration 20261022100200_member_github_username_backfill", () => {
  const sql = readFileSync(join(__dirname, "..", "prisma", "migrations", "20261022100200_member_github_username_backfill", "migration.sql"), "utf8");

  it("only fills empty rows and skips ambiguous names", () => {
    expect(sql).toMatch(/m\."githubUsername" = ''/);
    expect(sql).toMatch(/NOT EXISTS/);
    expect(sql).not.toMatch(/DELETE|DROP/i);
  });

  it("fills empty rows from the current username and leaves set ones (run against the test database)", async () => {
    const { user, project } = await inGroup("Ana Cruz", "ana-c", "");
    const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Lim" });
    await prisma.user.update({ where: { id: ben.id }, data: { githubUsername: "ben-l" } });
    await createMembership(ben.id, project.id);
    await prisma.member.create({ data: { projectId: project.id, studentName: "Ben Lim", githubUsername: "keep-me" } });
    for (const _ of [1, 2]) await prisma.$executeRawUnsafe(sql); // second run changes nothing
    const rows = await prisma.member.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.githubUsername)).toEqual(["ana-c", "keep-me"]);
    expect(user.id).toBeGreaterThan(0);
  });
});

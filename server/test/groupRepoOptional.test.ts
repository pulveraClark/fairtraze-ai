import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();
const migration = (name: string) =>
  readFileSync(join(__dirname, "..", "prisma", "migrations", name, "migration.sql"), "utf8");

async function setup(sourceType: "GITHUB" | "EDITOR" | "COMBINED", githubUsername: string | null = null) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType });
  const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  if (githubUsername !== null) await prisma.user.update({ where: { id: student.id }, data: { githubUsername } });
  await prisma.classEnrollment.create({ data: { userId: student.id, classSectionId: classSection.id } });
  return { instructor, assignment, student };
}

describe("migration 20261022100000_group_repo_optional", () => {
  const sql = migration("20261022100000_group_repo_optional");
  it("drops NOT NULL on Project.repoUrl", () => {
    expect(sql).toMatch(/ALTER TABLE "Project" ALTER COLUMN "repoUrl" DROP NOT NULL/);
  });
  it("turns the old empty-string rows into NULL", () => {
    expect(sql).toMatch(/UPDATE "Project" SET "repoUrl" = NULL WHERE "repoUrl" = ''/);
  });
});

describe("create a group without a repository", () => {
  it.each(["GITHUB", "COMBINED"] as const)("%s: a student with no GitHub username can create a group with no link", async (sourceType) => {
    const { assignment, student } = await setup(sourceType);
    const res = await request(app)
      .post("/api/join/create-group")
      .set("Authorization", authHeaderFor(student))
      .send({ assignmentId: assignment.id, groupName: "Group Alpha" });
    expect(res.status).toBe(201);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(project.repoUrl).toBeNull();
    const m = await prisma.groupMembership.findFirstOrThrow({ where: { projectId: project.id } });
    expect(m.role).toBe("LEADER");
  });

  it("EDITOR: stores no repository", async () => {
    const { assignment, student } = await setup("EDITOR");
    const res = await request(app)
      .post("/api/join/create-group")
      .set("Authorization", authHeaderFor(student))
      .send({ assignmentId: assignment.id, groupName: "Docs Team" });
    expect(res.status).toBe(201);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: res.body.id } })).repoUrl).toBeNull();
  });
});

describe("join a group without a GitHub username", () => {
  it("a GITHUB group accepts a join request from a student with no GitHub username", async () => {
    const { assignment, student } = await setup("GITHUB");
    const project = await createProject({ assignmentId: assignment.id, repoUrl: null });
    const { user: leader } = await createUser({ systemRole: "STUDENT" });
    await createMembership(leader.id, project.id, "LEADER");
    const res = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(student));
    expect(res.status).toBe(201);
  });
});

describe("analysis without a repository", () => {
  it.each(["GITHUB", "COMBINED"] as const)("%s: answers 409 REPO_NOT_LINKED, not a GitHub error", async (sourceType) => {
    const { instructor, assignment } = await setup(sourceType);
    const project = await createProject({ assignmentId: assignment.id, repoUrl: null });
    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: "REPO_NOT_LINKED", error: "Link a GitHub repository first." });
    expect(await prisma.report.count({ where: { projectId: project.id } })).toBe(0);
  });
});

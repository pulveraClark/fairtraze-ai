import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { runAutoAnalysis, autoUpdateFailed, type AutoRunDeps } from "../src/lib/autoAnalysis.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

async function setup(sourceType: "GITHUB" | "EDITOR" = "EDITOR") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: student } = await createUser({ systemRole: "STUDENT", name: "Member A" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id, repoUrl: sourceType === "EDITOR" ? null : "https://github.com/example/repo" });
  await createMembership(student.id, project.id, "LEADER");
  return { instructor, project, assignment };
}

const deps = (analyze: AutoRunDeps["analyze"]): AutoRunDeps => ({
  change: { latestCommitAt: async () => null, githubToken: "t" },
  analyze,
  log: () => {},
});
const failureOf = (id: number) => prisma.project.findUniqueOrThrow({ where: { id }, select: { lastAutoFailureAt: true, lastAutoFailureCode: true } });

describe("an automatic run that does not finish is remembered", () => {
  it("records the code of a failed result and a thrown error; a rate limit and a success record nothing", async () => {
    const failed = (await setup("GITHUB")).project;
    const limited = (await setup("GITHUB")).project;
    const threw = (await setup("GITHUB")).project;
    const fine = (await setup("GITHUB")).project;
    await runAutoAnalysis(new Date(), deps(async (id) => {
      if (id === failed.id) return { status: 502, body: { code: "GITHUB_UNREACHABLE", error: "x" }, streamed: false };
      if (id === limited.id) return { status: 429, body: { code: "GITHUB_RATE_LIMITED", error: "x" }, streamed: false };
      if (id === threw.id) throw new Error("boom");
      return { status: 200, body: {}, streamed: false };
    }));
    // After the rate limit the remaining GitHub groups are skipped, so run `threw` and `fine` on their own.
    await runAutoAnalysis(new Date(), deps(async (id) => {
      if (id === threw.id) throw new Error("boom");
      return { status: 200, body: {}, streamed: false };
    }));

    expect(await failureOf(failed.id)).toMatchObject({ lastAutoFailureCode: "GITHUB_UNREACHABLE" });
    expect((await failureOf(failed.id)).lastAutoFailureAt).toBeInstanceOf(Date);
    // A rate limit is waited out (the next scheduled run retries): the group is not marked failed.
    expect(await failureOf(limited.id)).toEqual({ lastAutoFailureAt: null, lastAutoFailureCode: null });
    expect(await failureOf(threw.id)).toMatchObject({ lastAutoFailureCode: "ANALYSIS_FAILED" });
    expect(await failureOf(fine.id)).toEqual({ lastAutoFailureAt: null, lastAutoFailureCode: null });
  });

  it("an unknown failure body falls back to ANALYSIS_FAILED, and a busy group is not a failure", async () => {
    const odd = (await setup()).project;
    const busy = (await setup()).project;
    await runAutoAnalysis(new Date(), deps(async (id) =>
      id === busy.id ? { status: 409, body: {}, streamed: false } : { status: 500, body: { error: "raw" }, streamed: false }));
    expect(await failureOf(odd.id)).toMatchObject({ lastAutoFailureCode: "ANALYSIS_FAILED" });
    expect(await failureOf(busy.id)).toEqual({ lastAutoFailureAt: null, lastAutoFailureCode: null });
  });
});

describe("the next analysis that saves a report clears it, and the report page says so only while it is true", () => {
  it("clears on success; the report payload flags it only when newer than the report and the project is active", async () => {
    const { instructor, project, assignment } = await setup("EDITOR");
    const auth = authHeaderFor(instructor);

    expect((await request(app).post(`/api/projects/${project.id}/analyze`).set("Authorization", auth)).status).toBe(200);
    const get = () => request(app).get(`/api/projects/${project.id}/report`).set("Authorization", auth);
    expect((await get()).body.autoUpdateFailed).toBe(false);

    // A failure after the report: flagged.
    await prisma.project.update({ where: { id: project.id }, data: { lastAutoFailureAt: new Date(Date.now() + 60_000), lastAutoFailureCode: "GITHUB_RATE_LIMITED" } });
    const flagged = await get();
    expect(flagged.status).toBe(200);
    expect(flagged.body.autoUpdateFailed).toBe(true);
    expect(JSON.stringify(flagged.body)).not.toContain("GITHUB_RATE_LIMITED"); // only the yes/no leaves the server

    // A failure older than the report: not flagged.
    await prisma.project.update({ where: { id: project.id }, data: { lastAutoFailureAt: new Date(Date.now() - 86_400_000) } });
    expect((await get()).body.autoUpdateFailed).toBe(false);

    // Past the active window (deadline more than 7 days ago): not flagged, so "soon" is never a promise nobody keeps.
    await prisma.project.update({ where: { id: project.id }, data: { lastAutoFailureAt: new Date(Date.now() + 60_000) } });
    await prisma.assignment.update({ where: { id: assignment.id }, data: { deadline: new Date(Date.now() - 30 * 86_400_000) } });
    expect((await get()).body.autoUpdateFailed).toBe(false);
    await prisma.assignment.update({ where: { id: assignment.id }, data: { deadline: null } });
    expect((await get()).body.autoUpdateFailed).toBe(true);

    // A new analysis clears the stored failure.
    expect((await request(app).post(`/api/projects/${project.id}/analyze`).set("Authorization", auth)).status).toBe(200);
    expect(await failureOf(project.id)).toEqual({ lastAutoFailureAt: null, lastAutoFailureCode: null });
    expect((await get()).body.autoUpdateFailed).toBe(false);
  });
});

describe("autoUpdateFailed", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const active = { createdAt: new Date("2026-10-01T00:00:00Z"), deadline: null };
  it("needs a failure, newer than the report, in an active project", () => {
    const report = new Date("2026-10-20T00:00:00Z");
    expect(autoUpdateFailed({ lastAutoFailureAt: null }, active, report, now)).toBe(false);
    expect(autoUpdateFailed({ lastAutoFailureAt: new Date("2026-10-19T00:00:00Z") }, active, report, now)).toBe(false);
    expect(autoUpdateFailed({ lastAutoFailureAt: new Date("2026-10-20T06:00:00Z") }, active, report, now)).toBe(true);
    expect(autoUpdateFailed({ lastAutoFailureAt: new Date("2026-10-20T06:00:00Z") }, null, report, now)).toBe(false);
    expect(autoUpdateFailed({ lastAutoFailureAt: new Date("2026-10-20T06:00:00Z") }, { ...active, deadline: new Date("2026-09-01T00:00:00Z") }, report, now)).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  refreshReportIfStale, resetRefreshCooldown, REFRESH_ON_OPEN_AFTER_MS, REFRESH_CHECK_COOLDOWN_MS, type RefreshDeps,
} from "../src/lib/autoAnalysis.js";
import { tryAcquireAnalysis, releaseAnalysis } from "../src/lib/analysisLock.js";
import { SCORING_RULES_VERSION } from "@shared/scoringRules.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const NOW = new Date("2026-10-26T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const OLD = new Date(NOW.getTime() - REFRESH_ON_OPEN_AFTER_MS - 5 * 60 * 1000); // just over an hour
const FRESH = new Date(NOW.getTime() - 30 * 60 * 1000);
const NEWER_THAN_OLD = new Date(OLD.getTime() + 10 * 60 * 1000);

async function setup(opts: { reportAt?: Date | null; deadline?: Date | null } = {}) {
  const { user: instructor } = await createUser();
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType: "GITHUB" });
  await prisma.assignment.update({ where: { id: asg.id }, data: { deadline: opts.deadline ?? null, createdAt: new Date(NOW.getTime() - 30 * 24 * HOUR) } });
  const project = await createProject({ assignmentId: asg.id });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  await createMembership(student.id, project.id, "MEMBER");
  const reportAt = opts.reportAt === undefined ? OLD : opts.reportAt;
  if (reportAt) {
    await prisma.report.create({
      data: { projectId: project.id, generatedAt: reportAt, teamHealth: "Healthy", content: JSON.stringify({ report: {}, scoringRulesVersion: SCORING_RULES_VERSION }) },
    });
  }
  return { instructor, project, student };
}

function deps(commitAt: Date | null) {
  const analyze = vi.fn(async () => ({ status: 200, body: {}, streamed: false }));
  const d: RefreshDeps = { change: { latestCommitAt: async () => commitAt, githubToken: "t" }, analyze };
  return { d, analyze };
}

beforeEach(() => resetRefreshCooldown());

describe("refreshReportIfStale: runs only when ALL conditions hold", () => {
  it("all hold (older than 1 h, active, changed, not busy) -> starts one analysis", async () => {
    const { project } = await setup();
    const { d, analyze } = deps(NEWER_THAN_OLD);
    expect(await refreshReportIfStale(project.id, NOW, d)).toEqual({ refreshing: true });
    expect(analyze).toHaveBeenCalledWith(project.id);
  });

  it("report not older than 1 hour -> no run, and no GitHub call", async () => {
    const { project } = await setup({ reportAt: FRESH });
    const latestCommitAt = vi.fn(async () => NEWER_THAN_OLD);
    const analyze = vi.fn();
    const r = await refreshReportIfStale(project.id, NOW, { change: { latestCommitAt, githubToken: "t" }, analyze });
    expect(r).toEqual({ refreshing: false, why: "recent" });
    expect(analyze).not.toHaveBeenCalled();
    expect(latestCommitAt).not.toHaveBeenCalled();
  });

  it("project no longer active (deadline + 7 days passed) -> no run", async () => {
    const { project } = await setup({ deadline: new Date(NOW.getTime() - 8 * 24 * HOUR) });
    const { d, analyze } = deps(NEWER_THAN_OLD);
    expect(await refreshReportIfStale(project.id, NOW, d)).toEqual({ refreshing: false, why: "not-eligible" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("nothing changed since the report -> no run", async () => {
    const { project } = await setup();
    const { d, analyze } = deps(new Date(OLD.getTime() - HOUR));
    expect(await refreshReportIfStale(project.id, NOW, d)).toEqual({ refreshing: false, why: "unchanged" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("an analysis is already running -> no run", async () => {
    const { project } = await setup();
    const { d, analyze } = deps(NEWER_THAN_OLD);
    expect(tryAcquireAnalysis(project.id)).toBe(true);
    try {
      expect(await refreshReportIfStale(project.id, NOW, d)).toEqual({ refreshing: false, why: "busy" });
    } finally {
      releaseAnalysis(project.id);
    }
    expect(analyze).not.toHaveBeenCalled();
  });

  it("no report yet -> no run (the first report is made with Analyze)", async () => {
    const { project } = await setup({ reportAt: null });
    const { d, analyze } = deps(NEWER_THAN_OLD);
    expect(await refreshReportIfStale(project.id, NOW, d)).toEqual({ refreshing: false, why: "no-report" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("asking again within the cooldown does not check GitHub again", async () => {
    const { project } = await setup();
    const latestCommitAt = vi.fn(async () => new Date(OLD.getTime() - HOUR));
    const analyze = vi.fn();
    const d: RefreshDeps = { change: { latestCommitAt, githubToken: "t" }, analyze };
    await refreshReportIfStale(project.id, NOW, d);
    const again = await refreshReportIfStale(project.id, new Date(NOW.getTime() + REFRESH_CHECK_COOLDOWN_MS - 1000), d);
    expect(again).toEqual({ refreshing: false, why: "checked-recently" });
    expect(latestCommitAt).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/groups/:id/refresh-report", () => {
  const app = createApp();

  it("a student cannot force a run: every request, whatever it sends, runs the same checks", async () => {
    // Fresh report: the server must not start anything no matter what the student asks for.
    const { project, student } = await setup({ reportAt: new Date() });
    const headers = { Authorization: authHeaderFor(student) };
    const before = await prisma.report.count({ where: { projectId: project.id } });
    for (const body of [{}, { force: true }, { refresh: true, olderThanMs: 0 }]) {
      const res = await request(app).post(`/api/groups/${project.id}/refresh-report`).set(headers).query({ force: "true" }).send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ refreshing: false });
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.report.count({ where: { projectId: project.id } })).toBe(before);
  });

  it("someone outside the group gets 403, an anonymous caller 401", async () => {
    const { project } = await setup();
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    expect((await request(app).post(`/api/groups/${project.id}/refresh-report`).set({ Authorization: authHeaderFor(outsider) })).status).toBe(403);
    expect((await request(app).post(`/api/groups/${project.id}/refresh-report`)).status).toBe(401);
  });

  it("another instructor (not the class owner) gets 403", async () => {
    const { project } = await setup();
    const { user: other } = await createUser({ systemRole: "INSTRUCTOR" });
    expect((await request(app).post(`/api/groups/${project.id}/refresh-report`).set({ Authorization: authHeaderFor(other) })).status).toBe(403);
  });
});

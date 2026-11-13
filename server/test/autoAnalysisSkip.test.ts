import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  reasonToReanalyze, selectDueGroups, latestReportOf, runAutoAnalysis, refreshReportIfStale, resetRefreshCooldown, inFailureBackoff,
  AUTO_FAILURE_BACKOFF_MS, REFRESH_FAILURE_BACKOFF_MS, type DueGroup,
} from "../src/lib/autoAnalysis.js";
import { SCORING_RULES_VERSION } from "@shared/scoringRules.js";
import { createUser, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const REPORT_AT = new Date("2026-10-20T10:00:00Z");
const BEFORE = new Date("2026-10-19T10:00:00Z");
const AFTER = new Date("2026-10-21T10:00:00Z");

async function setup(sourceType: "GITHUB" | "EDITOR" | "COMBINED", withReport = true) {
  const { user } = await createUser();
  const cls = await createClassSection(user.id);
  const assignment = await createAssignment(cls.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id, repoUrl: sourceType === "EDITOR" ? null : "https://github.com/example/repo" });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  await createMembership(student.id, project.id, "LEADER");
  const document = sourceType === "GITHUB" ? null : await prisma.document.create({ data: { groupId: project.id } });
  if (withReport) {
    await prisma.report.create({
      data: { projectId: project.id, generatedAt: REPORT_AT, teamHealth: "Healthy", content: JSON.stringify({ report: {}, scoringRulesVersion: SCORING_RULES_VERSION }) },
    });
  }
  const group = (await selectDueGroups(new Date())).find((g) => g.id === project.id) as DueGroup;
  return { project, group, document, student };
}

const commitAt = (d: Date | null) => ({ latestCommitAt: async () => d, githubToken: "t" });
const reason = async (group: DueGroup, project: { id: number }, deps = commitAt(BEFORE)) =>
  reasonToReanalyze(group, await latestReportOf(project.id), deps);

describe("reasonToReanalyze (skip if unchanged)", () => {
  it("no report yet -> analyze", async () => {
    const { project, group } = await setup("GITHUB", false);
    expect(await reason(group, project)).toBe("no-report");
  });

  it("GitHub: nothing newer than the report -> skip; a newer commit -> analyze", async () => {
    const { project, group } = await setup("GITHUB");
    expect(await reason(group, project, commitAt(BEFORE))).toBeNull();
    expect(await reason(group, project, commitAt(null))).toBeNull();
    expect(await reason(group, project, commitAt(AFTER))).toBe("new-commits");
  });

  it("Docs: an edit after the report -> analyze; an older edit -> skip; GitHub-only ignores edits", async () => {
    const { project, group, document, student } = await setup("EDITOR");
    await prisma.editEvent.create({ data: { documentId: document!.id, userId: student.id, eventType: "INSERT", position: 0, length: 5, timestamp: BEFORE } });
    expect(await reason(group, project)).toBeNull();
    await prisma.editEvent.create({ data: { documentId: document!.id, userId: student.id, eventType: "INSERT", position: 5, length: 5, timestamp: AFTER } });
    expect(await reason(group, project)).toBe("new-docs-edits");
    expect(await reason({ ...group, sourceType: "GITHUB" }, project)).toBeNull();
  });

  it("Combined: either source can trigger a run", async () => {
    const { project, group, document, student } = await setup("COMBINED");
    expect(await reason(group, project)).toBeNull();
    expect(await reason(group, project, commitAt(AFTER))).toBe("new-commits");
    await prisma.editEvent.create({ data: { documentId: document!.id, userId: student.id, eventType: "INSERT", position: 0, length: 5, timestamp: AFTER } });
    expect(await reason(group, project)).toBe("new-docs-edits");
  });

  it("stale markers and outdated rules force a run even with no new activity", async () => {
    const { project, group } = await setup("GITHUB");
    expect(await reason({ ...group, membershipChangedAt: AFTER }, project)).toBe("membership-changed");
    expect(await reason({ ...group, scoringConfigChangedAt: AFTER }, project)).toBe("settings-changed");

    await prisma.auditLog.create({ data: { actorName: "Leader", action: "GROUP_REPO_CHANGED", targetType: "GROUP", targetId: String(project.id), createdAt: AFTER } });
    expect(await reason(group, project)).toBe("repo-changed");
    await prisma.auditLog.deleteMany({});

    await prisma.report.updateMany({ where: { projectId: project.id }, data: { content: JSON.stringify({ report: {} }) } });
    expect(await reason(group, project)).toBe("rules-outdated");
  });
});


describe("back-off after a failed automatic run", () => {
  const HOUR = 60 * 60 * 1000;
  const NOW = new Date(Date.now() + 10 * 60 * 1000); // after the groups below are created, so they count as active
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const ok = { status: 200, body: {}, streamed: false };
  const mark = (id: number, at: Date) => prisma.project.update({ where: { id }, data: { lastAutoFailureAt: at, lastAutoFailureCode: "ANALYSIS_FAILED" } });
  // a commit newer than the report: without a back-off this group would be analyzed
  const run = (analyze: () => Promise<typeof ok>) =>
    runAutoAnalysis(NOW, { change: { latestCommitAt: async () => NOW, githubToken: "t" }, analyze, log: () => {} });

  beforeEach(() => resetRefreshCooldown());

  it("the constants are 6 hours and 30 minutes", () => {
    expect(AUTO_FAILURE_BACKOFF_MS).toBe(6 * HOUR);
    expect(REFRESH_FAILURE_BACKOFF_MS).toBe(30 * 60 * 1000);
  });

  it("pure rule: no failure, an old failure, a failure older than the report, and a recent failure", () => {
    const report = { generatedAt: ago(10 * HOUR) };
    expect(inFailureBackoff({ lastAutoFailureAt: null }, report, NOW, 6 * HOUR)).toBe(false);
    expect(inFailureBackoff({ lastAutoFailureAt: ago(2 * HOUR) }, report, NOW, 6 * HOUR)).toBe(true);
    expect(inFailureBackoff({ lastAutoFailureAt: ago(6 * HOUR) }, report, NOW, 6 * HOUR)).toBe(false);
    expect(inFailureBackoff({ lastAutoFailureAt: ago(11 * HOUR) }, report, NOW, 24 * HOUR)).toBe(false);
    expect(inFailureBackoff({ lastAutoFailureAt: ago(HOUR) }, null, NOW, 6 * HOUR)).toBe(true);
  });

  it("skips a group within 6 hours of its failure, with no analysis", async () => {
    const { project } = await setup("GITHUB");
    await mark(project.id, ago(2 * HOUR));
    const analyze = vi.fn(async () => ok);
    const summary = await run(analyze);
    expect(analyze).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ analyzed: 0, skipped: 1, failed: 0 });
  });

  it("tries again once the failure is more than 6 hours old", async () => {
    const { project } = await setup("GITHUB");
    await mark(project.id, ago(7 * HOUR));
    const analyze = vi.fn(async () => ok);
    await run(analyze);
    expect(analyze).toHaveBeenCalledWith(project.id);
  });

  it("a report saved after the failure clears the back-off", async () => {
    const { project } = await setup("GITHUB");
    await mark(project.id, ago(2 * HOUR));
    await prisma.report.create({
      data: { projectId: project.id, generatedAt: ago(HOUR), teamHealth: "Healthy", content: JSON.stringify({ report: {}, scoringRulesVersion: SCORING_RULES_VERSION }) },
    });
    const analyze = vi.fn(async () => ok);
    await run(analyze);
    expect(analyze).toHaveBeenCalledWith(project.id);
  });

  it("a group with no report yet is also backed off", async () => {
    const { project } = await setup("GITHUB", false);
    await mark(project.id, ago(HOUR));
    const analyze = vi.fn(async () => ok);
    await run(analyze);
    expect(analyze).not.toHaveBeenCalled();
  });

  it("refresh-on-open may retry after 30 minutes (not 6 hours), but not within 30 minutes", async () => {
    const { project } = await setup("GITHUB");
    const analyze = vi.fn(async () => ok);
    const d = { change: { latestCommitAt: async () => NOW, githubToken: "t" }, analyze };
    await mark(project.id, ago(10 * 60 * 1000));
    expect(await refreshReportIfStale(project.id, NOW, d)).toEqual({ refreshing: false, why: "failed-recently" });
    expect(analyze).not.toHaveBeenCalled();
    resetRefreshCooldown();
    await mark(project.id, ago(2 * HOUR));
    expect(await refreshReportIfStale(project.id, NOW, d)).toEqual({ refreshing: true });
  });
});

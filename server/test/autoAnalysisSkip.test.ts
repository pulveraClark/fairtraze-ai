import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { reasonToReanalyze, selectDueGroups, latestReportOf, type DueGroup } from "../src/lib/autoAnalysis.js";
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

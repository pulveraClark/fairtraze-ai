import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import type { TeamReport, AnyScoredMember } from "@shared/types.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { fetchRepoStats } from "../src/lib/github.js";
import { fetchRepoCommitMessages } from "../src/lib/githubCommitMessages.js";
import type { GitHubContributorData } from "../src/lib/github.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

// Phase 8: tasks, comments, attachments, watchers and commit links are planning data. They must never
// change a score, a flag, the Gini value, the team health or the text sent to the AI.

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.resolve(here, rel), "utf8");

describe("static: scoring and the AI input do not read task data", () => {
  const SCORING = [
    "../../shared/src/scoring.ts", "../../shared/src/documentScoring.ts", "../../shared/src/combinedScoring.ts",
    "../../shared/src/commitClassifier.ts", "../../shared/src/lineClassifier.ts", "../../shared/src/fileWeights.ts",
    "../../shared/src/editClassifier.ts", "../src/lib/gemini.ts", "../src/lib/scoringConfig.ts",
  ];

  it.each(SCORING)("%s never mentions tasks", (rel) => {
    const src = read(rel);
    expect(src).not.toMatch(/\btask(s)?\b/i);
    expect(src).not.toMatch(/Task(Status|Comment|Subtask|Watcher|Attachment|Activity|CommitLink|Milestone|Label)/);
    expect(src).not.toMatch(/taskTypes|taskBoard|taskCommitLinks|taskWatchers/);
  });

  it("the analysis route reads no task table; its only task-related import is the best-effort commit linker", () => {
    // The analysis itself moved out of the route into lib/analysisRunner.ts; check both files.
    for (const file of ["../src/routes/analyze.ts", "../src/lib/analysisRunner.ts"]) {
      const src = read(file);
      expect(src).not.toMatch(/prisma\.task|prisma\.taskComment|prisma\.taskSubtask|prisma\.taskWatcher|prisma\.taskAttachment|prisma\.taskActivity|prisma\.taskCommitLink|prisma\.taskMilestone/);
    }
    const taskImports = read("../src/lib/analysisRunner.ts").split(/\r?\n/).filter((l) => /^import .*(task|Task)/.test(l));
    expect(taskImports).toEqual(['import { linkCommitsBestEffort } from "./taskCommitLinks.js";']);
    expect(read("../src/routes/analyze.ts").split(/\r?\n/).filter((l) => /^import .*(task|Task)/.test(l))).toEqual([]);
    // It runs after the report is saved, not before.
    const src = read("../src/lib/analysisRunner.ts");
    expect(src.indexOf("linkCommitsBestEffort({")).toBeGreaterThan(src.indexOf("prisma.report.create"));
  });

  it("none of the task libraries import scoring", () => {
    for (const rel of ["../src/lib/taskCommitLinks.ts", "../src/lib/taskDueSweep.ts", "../src/lib/taskOverviewSummary.ts", "../src/lib/taskBoard.ts", "../src/lib/taskWatchers.ts"]) {
      const src = read(rel);
      const importLines = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
      expect(importLines, rel).not.toMatch(/[Ss]coring|scoringConfig|gemini/);
      expect(src, rel).not.toMatch(/computeTeamReport|computeCombinedTeamReport|computeDocumentTeamReport/);
    }
  });
});

const app = createApp();
const mockedFetchRepoStats = vi.mocked(fetchRepoStats);
const mockedCommitMessages = vi.mocked(fetchRepoCommitMessages);

function contributor(login: string, commits: number): GitHubContributorData {
  return {
    githubUsername: login, commits, additions: commits * 10, deletions: commits * 2,
    commitDates: Array.from({ length: commits }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
    codeLinesAdded: commits * 10, commentLinesAdded: 0, blankLinesAdded: 0, weightedAdditions: commits * 10, selfChurnRatio: 0,
    commitImpactBreakdown: { structural: 0, functional: commits, cosmetic: 0, trivial: 0 },
    fileTypeBreakdown: { source: commits * 10, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    filesChanged: commits,
  };
}

beforeEach(() => {
  process.env.GITHUB_TOKEN = "test-token";
  mockedFetchRepoStats.mockReset();
  mockedCommitMessages.mockReset();
  mockedCommitMessages.mockResolvedValue([]);
});

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: a } = await createUser({ systemRole: "STUDENT", name: "Member A" });
  const { user: b } = await createUser({ systemRole: "STUDENT", name: "Member B" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType: "GITHUB" });
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group 1" });
  await prisma.project.update({ where: { id: project.id }, data: { repoUrl: "https://github.com/acme/app", taskKey: "FT", nextTaskNumber: 10 } });
  await createMembership(a.id, project.id, "LEADER");
  await createMembership(b.id, project.id, "MEMBER");
  await prisma.member.createMany({
    data: [
      { projectId: project.id, studentName: "Member A", githubUsername: "member-a" },
      { projectId: project.id, studentName: "Member B", githubUsername: "member-b" },
    ],
  });
  return { instructor, a, b, project };
}

const analyze = (projectId: number, instructor: Parameters<typeof authHeaderFor>[0]) =>
  request(app).post(`/api/projects/${projectId}/analyze`).set("Authorization", authHeaderFor(instructor));

describe("analysis output is identical with and without tasks, comments, files, watchers and commit links", () => {
  it("same scores, flags, Gini and team health; the AI prompt input is identical too", async () => {
    const { instructor, a, b, project } = await setup();
    mockedFetchRepoStats.mockImplementation(async () => ({ contributors: [contributor("member-a", 9), contributor("member-b", 3)] }));

    const first = await analyze(project.id, instructor);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const reportBefore = first.body.report as TeamReport<AnyScoredMember>;

    // Load the group up with task data, including commits that the linker will attach during the next analysis.
    const t1 = await prisma.task.create({ data: { projectId: project.id, number: 1, title: "Heavy task", createdByUserId: a.id, assignedToUserId: b.id, position: 1, status: "DONE", done: true } });
    const t2 = await prisma.task.create({ data: { projectId: project.id, number: 2, title: "Overdue task", createdByUserId: a.id, assignedToUserId: b.id, position: 2, dueDate: new Date("2026-01-01T00:00:00Z") } });
    await prisma.taskComment.createMany({ data: [{ taskId: t1.id, authorId: a.id, body: "great work <@" + b.id + ">" }, { taskId: t2.id, authorId: b.id, body: "late, sorry" }] });
    await prisma.taskSubtask.create({ data: { taskId: t1.id, title: "sub", done: true, position: 1 } });
    await prisma.taskWatcher.create({ data: { taskId: t1.id, userId: a.id } });
    await prisma.taskAttachment.create({ data: { taskId: t1.id, projectId: project.id, kind: "PDF", mime: "application/pdf", filename: "x.pdf", size: 3, data: new Uint8Array([1, 2, 3]), createdById: b.id } });
    mockedCommitMessages.mockResolvedValue([{ sha: "a41f9c2d0000000000000000000000000000aaaa", message: "FT-1 done, FT-2 started", authorLogin: "member-b", committedAt: "2026-01-02T00:00:00.000Z" }]);

    const second = await analyze(project.id, instructor);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const reportAfter = second.body.report as TeamReport<AnyScoredMember>;

    // The hook ran during that analysis and linked the commit...
    expect(await prisma.taskCommitLink.count()).toBe(2);
    // ...and every score, flag, the Gini value and the team health are exactly as before.
    expect(reportAfter).toEqual(reportBefore);
    const stored = await prisma.report.findMany({ orderBy: { id: "asc" } });
    expect(stored).toHaveLength(2);
    expect(stored[1]!.gini).toBe(stored[0]!.gini);
    expect(stored[1]!.teamHealth).toBe(stored[0]!.teamHealth);
    const scoresOf = (content: string | null) => (JSON.parse(content!) as { report: { members: { contributionShare: number; flags: string[] }[] } }).report.members.map((m) => ({ s: m.contributionShare, f: m.flags }));
    expect(scoresOf(stored[1]!.content)).toEqual(scoresOf(stored[0]!.content));

    // The text sent to the AI is built from the report only, so it is the same text.
    const { formatPrompt } = await vi.importActual<typeof import("../src/lib/gemini.js")>("../src/lib/gemini.js");
    expect(formatPrompt("Group 1", reportAfter)).toBe(formatPrompt("Group 1", reportBefore));
  });

  it("a failing commit read never fails or changes an analysis", async () => {
    const { instructor, a, b, project } = await setup();
    mockedFetchRepoStats.mockImplementation(async () => ({ contributors: [contributor("member-a", 4), contributor("member-b", 4)] }));
    const clean = await analyze(project.id, instructor);
    await prisma.task.create({ data: { projectId: project.id, number: 1, title: "T", createdByUserId: a.id, assignedToUserId: b.id, position: 1 } });
    mockedCommitMessages.mockRejectedValue(new Error("GitHub is down"));
    const broken = await analyze(project.id, instructor);
    expect(broken.status).toBe(200);
    expect(broken.body.report).toEqual(clean.body.report);
    expect(await prisma.taskCommitLink.count()).toBe(0);
  });
});

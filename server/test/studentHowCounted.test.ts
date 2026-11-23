import { describe, it, expect } from "vitest";
import request from "supertest";
import type {
  ScoredMember, DocumentScoredMember, CombinedScoredMember, TeamReport, AnyScoredMember,
} from "@shared/types.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

// The fields "How this was counted" added to a student's own contribution (join.ts). They must be the
// caller's own values only, and the leader's view of OTHER members must carry none of them.
const NEW_FIELDS = ["commentLinesAdded", "blankLinesAdded", "selfChurnRatio", "importedRetainedChars", "insertedImageCount", "scoringRulesVersion"];

function scoredMember(overrides: Partial<ScoredMember> = {}): ScoredMember {
  return {
    studentName: "Student", githubUsername: "student", commits: 10, additions: 100, deletions: 10,
    churn: 110, activeDays: 3, lastPhaseRatio: 0.3, commitShare: 0.5, linesShare: 0.5, activeDaysShare: 0.5,
    contributionShare: 0.5, codeLinesAdded: 80, commentLinesAdded: 10, blankLinesAdded: 10,
    codeToCommentRatio: 8, weightedAdditions: 100, selfChurnRatio: 0,
    commitImpactBreakdown: { structural: 0, functional: 10, cosmetic: 0, trivial: 0 },
    fileTypeBreakdown: { source: 10, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    flags: [],
    ...overrides,
  };
}

function documentScoredMember(overrides: Partial<DocumentScoredMember> = {}): DocumentScoredMember {
  return {
    studentName: "Student", userId: 0, githubUsername: "", sessionCount: 4, totalInsertedChars: 1000,
    totalDeletedChars: 100, retainedChars: 900, effectiveRetainedChars: 900, churn: 1100, activeDays: 3,
    lastPhaseRatio: 0.3, sessionShare: 0.5, retainedTextShare: 0.5, activeDaysShare: 0.5,
    contributionShare: 0.5, selfChurnRatio: 0, weightedRetainedChars: 900,
    editTypeBreakdown: { substantive: 900, revision: 0, formatting: 0, trivial: 0 }, flags: [],
    importedRetainedChars: 0, importNote: null, insertedImageCount: 0,
    ...overrides,
  };
}

function combinedScoredMember(overrides: Partial<CombinedScoredMember> = {}): CombinedScoredMember {
  return {
    studentName: "Student", userId: 0, githubUsername: "", githubContributionShare: 0.5,
    documentContributionShare: 0.5, wGitHub: 0.5, wDocs: 0.5, contributionShare: 0.5, lastPhaseRatio: 0.3,
    flags: [], github: scoredMember(), document: documentScoredMember(),
    ...overrides,
  };
}

function teamReport<M extends AnyScoredMember>(members: M[]): TeamReport<M> {
  return { members, memberCount: members.length, gini: 0.37, teamHealth: "Moderate Risk", deadlineWindowBasis: "activity-span" };
}

async function saveReport(projectId: number, report: TeamReport<AnyScoredMember>, extra: Record<string, unknown> = {}) {
  return prisma.report.create({
    data: { projectId, gini: report.gini, teamHealth: report.teamHealth, content: JSON.stringify({ report, narrative: null, ...extra }) },
  });
}

function collectValuesByKey(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) out.push(v);
      collectValuesByKey(v, key, out);
    }
  }
  return out;
}

/** Every object key anywhere in the body (names only, never values). */
function allKeys(node: unknown, out = new Set<string>()): Set<string> {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

async function setup(sourceType: "GITHUB" | "EDITOR" | "COMBINED") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id });
  const { user: studentA } = await createUser({ systemRole: "STUDENT" });
  const { user: studentB } = await createUser({ systemRole: "STUDENT" });
  await createMembership(studentA.id, project.id, "MEMBER");
  await createMembership(studentB.id, project.id, "LEADER");
  return { project, studentA, studentB };
}

const get = (projectId: number, user: Parameters<typeof authHeaderFor>[0]) =>
  request(app).get(`/api/student/group/${projectId}`).set("Authorization", authHeaderFor(user));

describe("student payload: fields added for 'How this was counted' are the caller's own only", () => {
  it("GITHUB: own comment/blank lines, rules version, and none of the other member's numbers", async () => {
    const { project, studentA, studentB } = await setup("GITHUB");
    await prisma.user.update({ where: { id: studentA.id }, data: { githubUsername: "alice-gh" } });
    await prisma.user.update({ where: { id: studentB.id }, data: { githubUsername: "bob-gh" } });
    await saveReport(project.id, teamReport([
      scoredMember({ studentName: "Alice", githubUsername: "alice-gh", commentLinesAdded: 11, blankLinesAdded: 22, contributionShare: 0.6 }),
      scoredMember({ studentName: "Bob", githubUsername: "bob-gh", commentLinesAdded: 9991, blankLinesAdded: 9992, contributionShare: 0.4 }),
    ]), { scoringRulesVersion: 2 });

    const res = await get(project.id, studentA);
    expect(res.status).toBe(200);
    expect(res.body.report.myContribution).toMatchObject({ commentLinesAdded: 11, blankLinesAdded: 22 });
    expect(res.body.scoringRulesVersion).toBe(2);
    expect(JSON.stringify(res.body)).not.toMatch(/9991|9992|Bob|bob-gh/);
  });

  it("a report stored without a rules version reads as version 1", async () => {
    const { project, studentA } = await setup("GITHUB");
    await prisma.user.update({ where: { id: studentA.id }, data: { githubUsername: "alice-gh" } });
    await saveReport(project.id, teamReport([scoredMember({ githubUsername: "alice-gh" })]));
    const res = await get(project.id, studentA);
    expect(res.body.scoringRulesVersion).toBe(1);
  });

  it("EDITOR: own self-churn, import (only when an import note exists) and image count", async () => {
    const { project, studentA, studentB } = await setup("EDITOR");
    await saveReport(project.id, teamReport([
      documentScoredMember({ studentName: "Alice", userId: studentA.id, selfChurnRatio: 0.25, importedRetainedChars: 400, importNote: "estimate", insertedImageCount: 3 }),
      documentScoredMember({ studentName: "Bob", userId: studentB.id, selfChurnRatio: 0.777, importedRetainedChars: 8888, importNote: "estimate", insertedImageCount: 77 }),
    ]), { scoringRulesVersion: 2 });

    const res = await get(project.id, studentA);
    expect(res.body.report.myContribution).toMatchObject({ selfChurnRatio: 0.25, importedRetainedChars: 400, insertedImageCount: 3 });
    expect(JSON.stringify(res.body)).not.toMatch(/0\.777|8888|"insertedImageCount":77/);

    // Without an import note the imported count is sent as 0, never the raw number.
    const { project: p2, studentA: a2 } = await setup("EDITOR");
    await saveReport(p2.id, teamReport([documentScoredMember({ userId: a2.id, importedRetainedChars: 500, importNote: null })]));
    const res2 = await get(p2.id, a2);
    expect(res2.body.report.myContribution.importedRetainedChars).toBe(0);
  });

  it("COMBINED: nested github and document carry the own fields; a Docs-only member (github null) still works", async () => {
    const { project, studentA, studentB } = await setup("COMBINED");
    await saveReport(project.id, teamReport([
      combinedScoredMember({
        studentName: "Alice", userId: studentA.id, github: null,
        document: documentScoredMember({ userId: studentA.id, selfChurnRatio: 0.1, importedRetainedChars: 0, insertedImageCount: 1 }),
      }),
      combinedScoredMember({
        studentName: "Bob", userId: studentB.id,
        github: scoredMember({ commentLinesAdded: 7771, blankLinesAdded: 7772 }),
        document: documentScoredMember({ userId: studentB.id, selfChurnRatio: 0.555, insertedImageCount: 55 }),
      }),
    ]), { scoringRulesVersion: 2 });

    const asA = await get(project.id, studentA);
    expect(asA.body.report.myContribution.github).toBeNull();
    expect(asA.body.report.myContribution.document).toMatchObject({ selfChurnRatio: 0.1, insertedImageCount: 1 });
    expect(JSON.stringify(asA.body)).not.toMatch(/7771|7772|0\.555|Bob/);

    const asB = await get(project.id, studentB);
    expect(asB.body.report.myContribution.github).toMatchObject({ commentLinesAdded: 7771, blankLinesAdded: 7772 });
  });

  it("a plain member's payload has no Gini, band or team index anywhere, and no team view", async () => {
    const { project, studentA, studentB } = await setup("COMBINED");
    await saveReport(project.id, teamReport([
      combinedScoredMember({ studentName: "Alice", userId: studentA.id }),
      combinedScoredMember({ studentName: "Bob", userId: studentB.id }),
    ]), { scoringRulesVersion: 2 });
    const res = await get(project.id, studentA);
    expect(res.body.report.team).toBeUndefined();
    const keys = [...allKeys(res.body)].map((k) => k.toLowerCase());
    expect(keys.filter((k) => /gini|band|teamindex|index/.test(k))).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain("0.37");
  });
});

describe("leader view of OTHER members carries none of the new fields", () => {
  it("team[*] keeps its exact whitelist; the new fields live only in the leader's own myContribution", async () => {
    const { project, studentA, studentB } = await setup("COMBINED"); // A = member, B = leader
    await saveReport(project.id, teamReport([
      combinedScoredMember({ studentName: "Alice", userId: studentA.id, github: scoredMember({ commentLinesAdded: 4441, blankLinesAdded: 4442 }), document: documentScoredMember({ userId: studentA.id, selfChurnRatio: 0.444, insertedImageCount: 44 }) }),
      combinedScoredMember({ studentName: "Bob", userId: studentB.id }),
    ]), { scoringRulesVersion: 2 });

    const res = await get(project.id, studentB);
    expect(res.status).toBe(200);
    const team = res.body.report.team as Array<Record<string, unknown>>;
    expect(team).toHaveLength(2);
    for (const t of team) {
      expect(Object.keys(t).sort()).toEqual([
        "avatarUpdatedAt", "contributionShare", "documentContributionShare", "flags", "functionalRoles",
        "githubContributionShare", "hasAvatar", "isLeader", "name", "tasks", "userId",
      ]);
    }
    const teamKeys = allKeys(team);
    for (const f of NEW_FIELDS) expect(teamKeys.has(f), `team must not carry ${f}`).toBe(false);
    // Alice's numbers are nowhere in the leader's payload, in any form.
    expect(JSON.stringify(res.body)).not.toMatch(/4441|4442|0\.444/);
    // The leader's own data is allowed to carry them.
    expect(collectValuesByKey(res.body.report.myContribution, "commentLinesAdded")).toHaveLength(1);
    expect(res.body.scoringRulesVersion).toBe(2);
    // Gini / bands / index never reach a student, leader or not.
    expect([...allKeys(res.body)].map((k) => k.toLowerCase()).filter((k) => /gini|band|teamindex/.test(k))).toEqual([]);
  });
});

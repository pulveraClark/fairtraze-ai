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

// ── Fixture builders — only the fields the matching/response logic in join.ts reads are
// varied per test; everything else gets a neutral default so each TeamReport<M> fixture
// type-checks against the real shared types. ──────────────────────────────────────────

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
  return { members, memberCount: members.length, gini: 0.3, teamHealth: "Healthy", deadlineWindowBasis: "activity-span" };
}

async function saveReport(projectId: number, report: TeamReport<AnyScoredMember>) {
  return prisma.report.create({
    data: {
      projectId, gini: report.gini, teamHealth: report.teamHealth,
      content: JSON.stringify({ report, narrative: null }),
    },
  });
}

// Recursively collects every value found under the given key name anywhere in a JSON-like
// response body — used to assert that no other member's identity/score leaked into the payload.
function collectValuesByKey(node: unknown, key: string, out: unknown[] = []): unknown[] {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) out.push(v);
      collectValuesByKey(v, key, out);
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
  // studentA is a regular MEMBER (privacy assertions below); studentB is the LEADER, who
  // legitimately also receives the whitelisted `team` view (covered at the bottom).
  await createMembership(studentA.id, project.id, "MEMBER");
  await createMembership(studentB.id, project.id, "LEADER");
  return { instructor, project, studentA, studentB };
}

describe("GET /api/student/group/:projectId — contribution matching and privacy (caller studentA is a regular member)", () => {
  it("GITHUB: matches by githubUsername and leaks no other member's data", async () => {
    const { project, studentA, studentB } = await setup("GITHUB");
    await prisma.user.update({ where: { id: studentA.id }, data: { githubUsername: "alice-gh" } });
    await prisma.user.update({ where: { id: studentB.id }, data: { githubUsername: "bob-gh" } });

    await saveReport(project.id, teamReport([
      scoredMember({ studentName: "Alice", githubUsername: "alice-gh", contributionShare: 0.7 }),
      scoredMember({ studentName: "Bob", githubUsername: "bob-gh", contributionShare: 0.3 }),
    ]));

    const resA = await request(app)
      .get(`/api/student/group/${project.id}`)
      .set("Authorization", authHeaderFor(studentA));
    expect(resA.status).toBe(200);
    expect(resA.body.report.myContribution.contributionShare).toBe(0.7);

    // No trace of Bob's data anywhere in Alice's response.
    expect(resA.body.report.teamShares).toBeUndefined();
    expect(collectValuesByKey(resA.body, "contributionShare")).toEqual([0.7]);
    expect(collectValuesByKey(resA.body, "githubUsername")).not.toContain("bob-gh");
    expect(collectValuesByKey(resA.body, "studentName")).not.toContain("Bob");

    const resB = await request(app)
      .get(`/api/student/group/${project.id}`)
      .set("Authorization", authHeaderFor(studentB));
    expect(resB.status).toBe(200);
    expect(resB.body.report.myContribution.contributionShare).toBe(0.3);
  });

  it("GITHUB: a member missing from the report (no matching githubUsername) gets myContribution: null", async () => {
    const { project, studentA, studentB } = await setup("GITHUB");
    await prisma.user.update({ where: { id: studentA.id }, data: { githubUsername: "alice-gh" } });
    // studentB never set a githubUsername and never appears in the report.
    await saveReport(project.id, teamReport([
      scoredMember({ studentName: "Alice", githubUsername: "alice-gh", contributionShare: 1 }),
    ]));

    const resB = await request(app)
      .get(`/api/student/group/${project.id}`)
      .set("Authorization", authHeaderFor(studentB));
    expect(resB.status).toBe(200);
    expect(resB.body.report.myContribution).toBeNull();
  });

  it("EDITOR: matches by userId (not githubUsername) and leaks no other member's data", async () => {
    const { project, studentA, studentB } = await setup("EDITOR");

    await saveReport(project.id, teamReport([
      documentScoredMember({ studentName: "Alice", userId: studentA.id, githubUsername: "", contributionShare: 0.6 }),
      documentScoredMember({ studentName: "Bob", userId: studentB.id, githubUsername: "", contributionShare: 0.4 }),
    ]));

    const resA = await request(app)
      .get(`/api/student/group/${project.id}`)
      .set("Authorization", authHeaderFor(studentA));
    expect(resA.status).toBe(200);
    expect(resA.body.report.myContribution.contributionShare).toBe(0.6);
    expect(resA.body.report.myContribution.sessionCount).toBe(4);
    expect(resA.body.report.teamShares).toBeUndefined();
    expect(collectValuesByKey(resA.body, "contributionShare")).toEqual([0.6]);
    expect(collectValuesByKey(resA.body, "userId")).not.toContain(studentB.id);
    expect(collectValuesByKey(resA.body, "studentName")).not.toContain("Bob");
  });

  it("EDITOR: a member missing from the report (no matching userId) gets myContribution: null", async () => {
    const { project, studentA, studentB } = await setup("EDITOR");
    await saveReport(project.id, teamReport([
      documentScoredMember({ studentName: "Alice", userId: studentA.id, contributionShare: 1 }),
    ]));

    const resB = await request(app)
      .get(`/api/student/group/${project.id}`)
      .set("Authorization", authHeaderFor(studentB));
    expect(resB.status).toBe(200);
    expect(resB.body.report.myContribution).toBeNull();
  });

  it("COMBINED: matches by userId, passes through a null nested github without crashing, and leaks no other member's data", async () => {
    const { project, studentA, studentB } = await setup("COMBINED");

    await saveReport(project.id, teamReport([
      combinedScoredMember({
        studentName: "Alice", userId: studentA.id, githubUsername: "alice-gh",
        contributionShare: 0.55, githubContributionShare: 0, documentContributionShare: 0.55,
        github: null, // Documentation-only member with no recorded GitHub activity
      }),
      combinedScoredMember({
        studentName: "Bob", userId: studentB.id, githubUsername: "bob-gh", contributionShare: 0.45,
      }),
    ]));

    const resA = await request(app)
      .get(`/api/student/group/${project.id}`)
      .set("Authorization", authHeaderFor(studentA));
    expect(resA.status).toBe(200);
    expect(resA.body.report.myContribution.contributionShare).toBe(0.55);
    expect(resA.body.report.myContribution.github).toBeNull();
    expect(resA.body.report.myContribution.document).not.toBeNull();
    expect(resA.body.report.teamShares).toBeUndefined();
    expect(collectValuesByKey(resA.body, "contributionShare")).toEqual([0.55]);
    expect(collectValuesByKey(resA.body, "githubUsername")).not.toContain("bob-gh");
    expect(collectValuesByKey(resA.body, "userId")).not.toContain(studentB.id);
  });
});

describe("GET /api/student/group/:projectId — leader team view", () => {
  it("leader receives every member's share, GitHub/Docs split, flags and task counts", async () => {
    const { project, studentA, studentB } = await setup("COMBINED"); // A = member, B = leader
    await saveReport(project.id, teamReport([
      combinedScoredMember({ studentName: "Alice", userId: studentA.id, contributionShare: 0.7,
        githubContributionShare: 0.8, documentContributionShare: 0.6, flags: ["overload"] }),
      combinedScoredMember({ studentName: "Bob", userId: studentB.id, contributionShare: 0.3,
        githubContributionShare: 0.2, documentContributionShare: 0.4 }),
    ]));
    await prisma.task.createMany({ data: [
      { projectId: project.id, title: "t1", assignedToUserId: studentA.id, createdByUserId: studentB.id, done: true },
      { projectId: project.id, title: "t2", assignedToUserId: studentA.id, createdByUserId: studentB.id, done: false },
    ] });

    const res = await request(app).get(`/api/student/group/${project.id}`).set("Authorization", authHeaderFor(studentB));
    expect(res.status).toBe(200);
    const team = res.body.report.team as Array<Record<string, unknown>>;
    expect(team).toHaveLength(2);
    const alice = team.find((t) => t.userId === studentA.id)!;
    expect(alice).toMatchObject({
      contributionShare: 0.7, githubContributionShare: 0.8, documentContributionShare: 0.6,
      flags: ["overload"], tasks: { open: 1, done: 1 }, isLeader: false,
    });
    expect(team.find((t) => t.userId === studentB.id)).toMatchObject({ isLeader: true, contributionShare: 0.3 });
    // Whitelist: nothing instructor-only or identifying beyond name leaks.
    expect(Object.keys(alice).sort()).toEqual([
      "avatarUpdatedAt", "contributionShare", "documentContributionShare", "flags", "functionalRoles",
      "githubContributionShare", "hasAvatar", "isLeader", "name", "tasks", "userId",
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/dispute|instructorNote|email/i);
  });

  it("leader sees a member missing from the report with null shares (GITHUB)", async () => {
    const { project, studentA, studentB } = await setup("GITHUB");
    await prisma.user.update({ where: { id: studentB.id }, data: { githubUsername: "bob-gh" } });
    await saveReport(project.id, teamReport([
      scoredMember({ studentName: "Bob", githubUsername: "bob-gh", contributionShare: 1 }),
    ]));
    const res = await request(app).get(`/api/student/group/${project.id}`).set("Authorization", authHeaderFor(studentB));
    const team = res.body.report.team as Array<{ userId: number; contributionShare: number | null }>;
    expect(team.find((t) => t.userId === studentA.id)!.contributionShare).toBeNull();
    expect(team.find((t) => t.userId === studentB.id)!.contributionShare).toBe(1);
  });

  it("a regular member's response has no team key and no teammate values", async () => {
    const { project, studentA, studentB } = await setup("EDITOR");
    await saveReport(project.id, teamReport([
      documentScoredMember({ studentName: "Alice", userId: studentA.id, contributionShare: 0.6 }),
      documentScoredMember({ studentName: "Bob", userId: studentB.id, contributionShare: 0.4 }),
    ]));
    const res = await request(app).get(`/api/student/group/${project.id}`).set("Authorization", authHeaderFor(studentA));
    expect(res.status).toBe(200);
    expect(res.body.report.team).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("Bob");
    expect(collectValuesByKey(res.body, "contributionShare")).toEqual([0.6]);
  });

  it("a non-member (even another group's leader) gets 403", async () => {
    const { project } = await setup("EDITOR");
    const { project: other } = await setup("EDITOR");
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    await createMembership(outsider.id, other.id, "LEADER");
    const res = await request(app).get(`/api/student/group/${project.id}`).set("Authorization", authHeaderFor(outsider));
    expect(res.status).toBe(403);
  });
});

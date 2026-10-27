import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { fetchRepoStats } from "../src/lib/github.js";
import type { GitHubContributorData } from "../src/lib/github.js";
import { configsEqual, assignmentScoringConfig } from "../src/lib/scoringConfig.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject } from "./factories.js";

const app = createApp();
const mockedFetchRepoStats = vi.mocked(fetchRepoStats);

const NEW_CONFIG = {
  weights: { commits: 0.5, lines: 0.3, activeDays: 0.2 },
  thresholds: { freeRider: 0.4, overload: 2, deadlineDriven: 0.7 },
  blend: { wGitHub: 0.6, wDocs: 0.4 },
};

function contributor(login: string, commits: number): GitHubContributorData {
  return {
    githubUsername: login,
    commits,
    additions: commits * 10,
    deletions: commits * 2,
    commitDates: Array.from({ length: commits }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
    codeLinesAdded: commits * 10,
    commentLinesAdded: 0,
    blankLinesAdded: 0,
    weightedAdditions: commits * 10,
    selfChurnRatio: 0,
    commitImpactBreakdown: { structural: 0, functional: commits, cosmetic: 0, trivial: 0 },
    fileTypeBreakdown: { source: commits * 10, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    filesChanged: commits,
  };
}

beforeEach(() => {
  process.env.GITHUB_TOKEN = "test-token";
  mockedFetchRepoStats.mockReset();
  mockedFetchRepoStats.mockResolvedValue({ contributors: [contributor("member-a", 3), contributor("member-b", 2)] } as never);
});

// An instructor-owned GITHUB assignment with two groups, each with two GitHub members.
async function setup(sourceType: "GITHUB" | "COMBINED" = "GITHUB") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType });
  const groups = [];
  for (const name of ["Group 1", "Group 2"]) {
    const group = await createProject({ assignmentId: assignment.id, groupName: name });
    await prisma.member.createMany({
      data: [
        { projectId: group.id, studentName: "Member A", githubUsername: "member-a" },
        { projectId: group.id, studentName: "Member B", githubUsername: "member-b" },
      ],
    });
    groups.push(group);
  }
  return { instructor, assignment, groups };
}

type Inst = Parameters<typeof authHeaderFor>[0];

async function saveConfig(assignmentId: number, instructor: Inst, body: unknown = NEW_CONFIG) {
  return request(app)
    .patch(`/api/assignments/${assignmentId}/scoring-config`)
    .set("Authorization", authHeaderFor(instructor))
    .send(body as object);
}

async function analyze(projectId: number, instructor: Inst) {
  const res = await request(app).post(`/api/projects/${projectId}/analyze`).set("Authorization", authHeaderFor(instructor));
  expect(res.status).toBe(200);
}

async function getReport(projectId: number, instructor: Inst) {
  const res = await request(app).get(`/api/projects/${projectId}/report`).set("Authorization", authHeaderFor(instructor));
  expect(res.status).toBe(200);
  return res.body as { scoringConfig: typeof NEW_CONFIG | null; currentConfig: typeof NEW_CONFIG; assignmentId: number };
}

async function getSummary(instructor: Inst) {
  const res = await request(app).get("/api/projects/summary").set("Authorization", authHeaderFor(instructor));
  return res.body.summary as { projectId: number; settingsOutdated: boolean; scoringConfigChangedAt: string | null }[];
}

describe("project-level scoring settings", () => {
  it("settings saved once apply to every group's next analysis", async () => {
    const { instructor, assignment, groups } = await setup();
    expect((await saveConfig(assignment.id, instructor)).status).toBe(200);

    for (const g of groups) await analyze(g.id, instructor);

    for (const g of groups) {
      const r = await getReport(g.id, instructor);
      expect(r.scoringConfig?.weights).toEqual(NEW_CONFIG.weights);
      expect(r.scoringConfig?.thresholds).toEqual(NEW_CONFIG.thresholds);
    }
  });

  it("two groups in one assignment get identical config", async () => {
    const { instructor, assignment, groups } = await setup();
    await saveConfig(assignment.id, instructor);
    for (const g of groups) await analyze(g.id, instructor);

    const [a, b] = await Promise.all(groups.map((g) => getReport(g.id, instructor)));
    expect(a.currentConfig).toEqual(b.currentConfig);
    expect(a.scoringConfig).toEqual(b.scoringConfig);
    expect(a.assignmentId).toBe(assignment.id);
  });

  it("the legacy group columns are no longer read", async () => {
    const { instructor, groups } = await setup();
    await prisma.project.update({ where: { id: groups[0].id }, data: { weightCommits: 0.9, weightLines: 0.05, weightActiveDays: 0.05 } });
    await analyze(groups[0].id, instructor);
    const r = await getReport(groups[0].id, instructor);
    expect(r.scoringConfig?.weights).toEqual({ commits: 0.4, lines: 0.4, activeDays: 0.2 });
  });

  it("old reports keep their stored scoringConfig; changed settings mark them outdated until re-analyzed", async () => {
    const { instructor, assignment, groups } = await setup();
    await analyze(groups[0].id, instructor);
    expect((await getSummary(instructor)).find((s) => s.projectId === groups[0].id)?.settingsOutdated).toBe(false);

    await saveConfig(assignment.id, instructor);

    const r = await getReport(groups[0].id, instructor);
    expect(r.scoringConfig?.weights).toEqual({ commits: 0.4, lines: 0.4, activeDays: 0.2 }); // as scored
    expect(r.currentConfig.weights).toEqual(NEW_CONFIG.weights);
    expect((await getSummary(instructor)).find((s) => s.projectId === groups[0].id)?.settingsOutdated).toBe(true);

    await analyze(groups[0].id, instructor);
    const after = await getReport(groups[0].id, instructor);
    expect(after.scoringConfig?.weights).toEqual(NEW_CONFIG.weights);
    expect((await getSummary(instructor)).find((s) => s.projectId === groups[0].id)?.settingsOutdated).toBe(false);
  });

  it("a save marks every group stale; a save that changes nothing marks none", async () => {
    const { instructor, assignment, groups } = await setup();
    for (const g of groups) await analyze(g.id, instructor);

    // Same values as the current (default) settings, with float noise below epsilon.
    const unchanged = { ...NEW_CONFIG, weights: { commits: 0.4 + 1e-9, lines: 0.4, activeDays: 0.2 },
      thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 }, blend: { wGitHub: 0.5, wDocs: 0.5 } };
    expect((await saveConfig(assignment.id, instructor, unchanged)).status).toBe(200);
    let summary = await getSummary(instructor);
    expect(summary.every((s) => s.scoringConfigChangedAt === null && !s.settingsOutdated)).toBe(true);

    expect((await saveConfig(assignment.id, instructor)).status).toBe(200);
    summary = await getSummary(instructor);
    expect(summary).toHaveLength(2);
    expect(summary.every((s) => s.scoringConfigChangedAt !== null && s.settingsOutdated)).toBe(true);
  });

  it("only the owning instructor can edit; an admin can neither edit nor read", async () => {
    const { instructor, assignment } = await setup();
    const { user: other } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: student } = await createUser({ systemRole: "STUDENT" });

    expect((await saveConfig(assignment.id, instructor)).status).toBe(200);
    expect((await saveConfig(assignment.id, other, { ...NEW_CONFIG, weights: { commits: 0.2, lines: 0.2, activeDays: 0.6 } })).status).toBe(403);
    expect((await saveConfig(assignment.id, admin, { ...NEW_CONFIG, weights: { commits: 0.2, lines: 0.2, activeDays: 0.6 } })).status).toBe(403);
    expect((await saveConfig(assignment.id, student)).status).toBe(403);

    const row = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(row.weightCommits).toBe(NEW_CONFIG.weights.commits); // others' attempts changed nothing

    const read = await request(app).get(`/api/assignments/${assignment.id}`).set("Authorization", authHeaderFor(admin));
    expect(read.status).toBe(403);
    const ownerRead = await request(app).get(`/api/assignments/${assignment.id}`).set("Authorization", authHeaderFor(instructor));
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.assignment.scoringConfig.weights).toEqual(NEW_CONFIG.weights);
  });

  it("rejects weights or blend that do not sum to 1", async () => {
    const { instructor, assignment } = await setup();
    expect((await saveConfig(assignment.id, instructor, { ...NEW_CONFIG, weights: { commits: 0.5, lines: 0.5, activeDays: 0.5 } })).status).toBe(400);
    expect((await saveConfig(assignment.id, instructor, { ...NEW_CONFIG, blend: { wGitHub: 0.9, wDocs: 0.5 } })).status).toBe(400);
  });

  it("legacy PATCH /api/projects/:id/config writes the assignment, not the group", async () => {
    const { instructor, assignment, groups } = await setup();
    const res = await request(app)
      .patch(`/api/projects/${groups[0].id}/config`)
      .set("Authorization", authHeaderFor(instructor))
      .send(NEW_CONFIG);
    expect(res.status).toBe(200);

    const a = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(a.weightCommits).toBe(0.5);
    const g = await prisma.project.findUniqueOrThrow({ where: { id: groups[0].id } });
    expect(g.weightCommits).toBe(0.4); // legacy column untouched

    const orphan = await createProject({ assignmentId: null });
    const orphanRes = await request(app).patch(`/api/projects/${orphan.id}/config`).set("Authorization", authHeaderFor(instructor)).send(NEW_CONFIG);
    expect(orphanRes.status).toBe(400);
  });
});

describe("configsEqual", () => {
  it("compares with epsilon and ignores blend unless COMBINED", () => {
    const a = assignmentScoringConfig({ weightCommits: 0.4, weightLines: 0.4, weightActiveDays: 0.2, freeRiderThreshold: 0.5, overloadThreshold: 1.75, deadlineDrivenThreshold: 0.6, weightGithub: 0.5, weightDocs: 0.5 });
    const b = { ...a, weights: { ...a.weights, commits: 0.4 + 1e-9 }, blend: { wGitHub: 0.7, wDocs: 0.3 } };
    expect(configsEqual(a, b, false)).toBe(true);
    expect(configsEqual(a, b, true)).toBe(false);
    expect(configsEqual(a, { ...a, thresholds: { ...a.thresholds, overload: 2 } }, false)).toBe(false);
  });
});

describe("migration backfill rule", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../prisma/migrations/20261013100000_assignment_scoring_config/migration.sql", import.meta.url)),
    "utf8",
  );
  const section = sql.split("-- BACKFILL-START")[1]!.split("-- BACKFILL-END")[0]!;
  // strip comment lines, split into statements (the section has no inner semicolons)
  const statements = section.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((s) => s.trim()).filter(Boolean);

  const CUSTOM = { weightCommits: 0.6, weightLines: 0.2, weightActiveDays: 0.2, freeRiderThreshold: 0.3, overloadThreshold: 2.5, deadlineDrivenThreshold: 0.8, weightGithub: 0.7, weightDocs: 0.3 };

  async function runBackfill() {
    for (const s of statements) await prisma.$executeRawUnsafe(s);
  }
  async function makeAssignment(classSectionId: number) {
    return createAssignment(classSectionId);
  }
  async function group(assignmentId: number, legacy: Partial<typeof CUSTOM>) {
    const p = await createProject({ assignmentId });
    return prisma.project.update({ where: { id: p.id }, data: legacy });
  }

  it("uniform groups -> assignment takes their values; conflict or empty -> defaults, conflicting scored groups marked stale", async () => {
    expect(statements.length).toBe(2);
    const { user } = await createUser({ systemRole: "INSTRUCTOR" });
    const cls = await createClassSection(user.id);

    const uniform = await makeAssignment(cls.id);
    await group(uniform.id, CUSTOM);
    await group(uniform.id, CUSTOM);

    const conflicting = await makeAssignment(cls.id);
    const scored = await group(conflicting.id, CUSTOM);
    await group(conflicting.id, { ...CUSTOM, weightCommits: 0.5, weightLines: 0.3 });
    await prisma.report.create({ data: { projectId: scored.id, content: "{}" } });

    const empty = await makeAssignment(cls.id);

    await runBackfill();

    const u = await prisma.assignment.findUniqueOrThrow({ where: { id: uniform.id } });
    expect(u).toMatchObject(CUSTOM);
    const c = await prisma.assignment.findUniqueOrThrow({ where: { id: conflicting.id } });
    expect(c).toMatchObject({ weightCommits: 0.4, weightLines: 0.4, weightActiveDays: 0.2, freeRiderThreshold: 0.5, overloadThreshold: 1.75, deadlineDrivenThreshold: 0.6, weightGithub: 0.5, weightDocs: 0.5 });
    const e = await prisma.assignment.findUniqueOrThrow({ where: { id: empty.id } });
    expect(e.weightCommits).toBe(0.4);

    // Group scored with values that differ from its (default) assignment is flagged; uniform groups are not.
    expect((await prisma.project.findUniqueOrThrow({ where: { id: scored.id } })).scoringConfigChangedAt).not.toBeNull();
    const uniformGroups = await prisma.project.findMany({ where: { assignmentId: uniform.id } });
    expect(uniformGroups.every((g) => g.scoringConfigChangedAt === null)).toBe(true);
  });
});

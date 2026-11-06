import { describe, it, expect } from "vitest";
import request from "supertest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ScoredMember, TeamReport } from "@shared/types.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

function member(over: Partial<ScoredMember>): ScoredMember {
  return {
    studentName: "M", githubUsername: "m", commits: 10, additions: 100, deletions: 10, churn: 110, activeDays: 3,
    lastPhaseRatio: 0.3, commitShare: 0.5, linesShare: 0.5, activeDaysShare: 0.5, contributionShare: 0.5,
    codeLinesAdded: 80, commentLinesAdded: 10, blankLinesAdded: 10, codeToCommentRatio: 8, weightedAdditions: 100, selfChurnRatio: 0,
    commitImpactBreakdown: { structural: 0, functional: 10, cosmetic: 0, trivial: 0 },
    fileTypeBreakdown: { source: 10, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    flags: [], ...over,
  };
}

async function seed(days: [number, number], shares: [number, number] = [0.7, 0.3]) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "GITHUB" });
  const project = await createProject({ assignmentId: asg.id });
  const { user: a } = await createUser({ systemRole: "STUDENT" });
  const { user: b } = await createUser({ systemRole: "STUDENT" });
  await createMembership(a.id, project.id, "MEMBER");
  await createMembership(b.id, project.id, "LEADER");
  await prisma.user.update({ where: { id: a.id }, data: { githubUsername: "a-gh" } });
  await prisma.user.update({ where: { id: b.id }, data: { githubUsername: "b-gh" } });
  const report: TeamReport<ScoredMember> = {
    members: [
      member({ studentName: "A", githubUsername: "a-gh", activeDays: days[0], contributionShare: shares[0], flags: shares[0] ? ["overload"] : [] }),
      member({ studentName: "B", githubUsername: "b-gh", activeDays: days[1], contributionShare: shares[1], flags: shares[1] < 0.5 && shares[1] > 0 ? ["free-rider"] : [] }),
    ],
    memberCount: 2, gini: 0.4, teamHealth: "High Risk", deadlineWindowBasis: "activity-span",
  };
  const row = await prisma.report.create({
    data: { projectId: project.id, gini: report.gini, teamHealth: report.teamHealth, content: JSON.stringify({ report, narrative: null, scoringRulesVersion: 2 }) },
  });
  return { instructor, project, a, row };
}

const asInstructor = (projectId: number, u: Parameters<typeof authHeaderFor>[0]) =>
  request(app).get(`/api/projects/${projectId}/report`).set("Authorization", authHeaderFor(u));
const asStudent = (projectId: number, u: Parameters<typeof authHeaderFor>[0]) =>
  request(app).get(`/api/student/group/${projectId}`).set("Authorization", authHeaderFor(u));

describe("Early data level in the two report read endpoints", () => {
  it("low under 5 days, medium 5 to 14, high from 15 (most active member), same for instructor and student", async () => {
    for (const [days, level] of [[[3, 4], "low"], [[8, 2], "medium"], [[20, 1], "high"]] as const) {
      const { instructor, project, a } = await seed([days[0], days[1]]);
      expect((await asInstructor(project.id, instructor)).body.dataConfidence, `instructor ${days}`).toBe(level);
      expect((await asStudent(project.id, a)).body.report.dataConfidence, `student ${days}`).toBe(level);
    }
  });

  it("nobody has activity: no level at all (the 'Not enough activity yet' state keeps its own words)", async () => {
    const { instructor, project, a } = await seed([0, 0], [0, 0]);
    expect((await asInstructor(project.id, instructor)).body.dataConfidence).toBeNull();
    const stu = await asStudent(project.id, a);
    expect(stu.body.report.noActivity).toBe(true);
    expect(stu.body.report.dataConfidence).toBeNull();
  });

  it("reading it changes nothing stored: report row, flags, Gini, health and alerts are identical afterwards", async () => {
    const { instructor, project, a, row } = await seed([2, 3]);
    const alertsBefore = await prisma.alert.count();
    const reportsBefore = await prisma.report.count({ where: { projectId: project.id } });
    const inst = await asInstructor(project.id, instructor);
    await asStudent(project.id, a);
    const after = await prisma.report.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.content).toBe(row.content);
    expect(after.gini).toBe(row.gini);
    expect(after.teamHealth).toBe(row.teamHealth);
    expect(await prisma.report.count({ where: { projectId: project.id } })).toBe(reportsBefore);
    expect(await prisma.alert.count()).toBe(alertsBefore);
    // The computed numbers and flags the instructor gets are the stored ones, untouched by the low level.
    expect(inst.body.dataConfidence).toBe("low");
    expect(inst.body.report.gini).toBe(0.4);
    expect(inst.body.report.teamHealth).toBe("High Risk");
    expect(inst.body.report.members.map((m: { flags: string[] }) => m.flags)).toEqual([["overload"], ["free-rider"]]);
  });

  it("a student payload never carries Gini, bands or an index (only the level word)", async () => {
    const { project, a } = await seed([2, 3]);
    const keys = new Set<string>();
    const walk = (n: unknown) => { if (n && typeof n === "object") for (const [k, v] of Object.entries(n)) { keys.add(k.toLowerCase()); walk(v); } };
    walk((await asStudent(project.id, a)).body);
    expect([...keys].filter((k) => /gini|band|teamindex/.test(k))).toEqual([]);
  });
});

describe("display only: nothing that scores, analyzes, alerts or exports reads the level", () => {
  const SRC = path.resolve(__dirname, "../src");
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
  it("only the two read endpoints and their helper mention it", () => {
    const hits = walk(SRC)
      .filter((f) => /dataConfidence|reportConfidence|DATA_CONFIDENCE/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(SRC, f).replace(/\\/g, "/"))
      .sort();
    expect(hits).toEqual(["lib/reportConfidence.ts", "routes/join.ts", "routes/projects.ts"]);
  });
});

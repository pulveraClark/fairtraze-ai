import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { ScoredMember, TeamReport } from "@shared/types.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

vi.hoisted(() => { process.env.REQUEST_TIMING_LOG = "on"; });

// Characterisation test for GET /api/projects/:id/report. The full response body is pinned (as a snapshot written
// from the code BEFORE the E1-2 parallelisation) for GITHUB, EDITOR and COMBINED groups, plus the error cases.
// Ids and the random evidence code are replaced by tokens so the snapshot is stable.

const app = createApp();
const GENERATED_AT = new Date("2026-11-12T00:00:00Z");
const PRE_FIX = new Date("2026-09-01T00:00:00Z"); // before AUTHORSHIP_FIX_AT (default 2026-10-08)
const NOV10 = new Date("2026-11-10T12:00:00Z");

const ID_KEYS = new Set(["projectId", "assignmentId", "userId"]);
function norm(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => {
      if (ID_KEYS.has(k) && typeof x === "number") return [k, `<${k}>`];
      if (k === "evidenceReportId" && typeof x === "string") return [k, "<code>"];
      return [k, norm(x)];
    }));
  }
  return v;
}

function ghMember(over: Partial<ScoredMember>): ScoredMember {
  return {
    studentName: "M", githubUsername: "m", commits: 10, additions: 100, deletions: 10, churn: 110, activeDays: 3,
    lastPhaseRatio: 0.3, commitShare: 0.5, linesShare: 0.5, activeDaysShare: 0.5, contributionShare: 0.5,
    codeLinesAdded: 80, commentLinesAdded: 10, blankLinesAdded: 10, codeToCommentRatio: 8, weightedAdditions: 100, selfChurnRatio: 0,
    commitImpactBreakdown: { structural: 0, functional: 10, cosmetic: 0, trivial: 0 },
    fileTypeBreakdown: { source: 10, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    flags: [], ...over,
  };
}

async function setup(sourceType: "GITHUB" | "EDITOR" | "COMBINED") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType });
  const project = await createProject({ assignmentId: asg.id, groupName: "Group Eq" });
  const { user: lead } = await createUser({ systemRole: "STUDENT", name: "Lead" });
  const { user: other } = await createUser({ systemRole: "STUDENT", name: "Other" });
  await createMembership(lead.id, project.id, "LEADER");
  await createMembership(other.id, project.id, "MEMBER");
  await prisma.user.update({ where: { id: lead.id }, data: { githubUsername: "lead-gh" } });
  await prisma.user.update({ where: { id: other.id }, data: { githubUsername: "other-gh" } });
  await prisma.task.create({ data: { projectId: project.id, number: 1, title: "T1", createdByUserId: lead.id, assignedToUserId: other.id, done: true, status: "DONE" } });
  await prisma.task.create({ data: { projectId: project.id, number: 2, title: "T2", createdByUserId: lead.id, assignedToUserId: other.id } });
  return { instructor, project, lead, other };
}

async function saveGithubReport(projectId: number) {
  const report: TeamReport<ScoredMember> = {
    members: [
      ghMember({ studentName: "Lead", githubUsername: "lead-gh", contributionShare: 0.7, flags: ["overload"] }),
      ghMember({ studentName: "Other", githubUsername: "other-gh", contributionShare: 0.3, commits: 0, flags: ["free-rider"] }),
    ],
    memberCount: 2, gini: 0.4, teamHealth: "High Risk", deadlineWindowBasis: "activity-span",
  };
  return prisma.report.create({
    data: { projectId, gini: report.gini, teamHealth: report.teamHealth, generatedAt: GENERATED_AT,
      content: JSON.stringify({ report, narrative: "Narrative text.", unmatchedLogins: ["ghost"], scoringRulesVersion: 3 }) },
  });
}

async function saveDocsReport(projectId: number, documentId: number, users: { id: number; name: string }[]) {
  const raw = await computeDocumentRawStats(documentId, users.map((u) => ({ userId: u.id, studentName: u.name, githubUsername: "" })));
  const report = computeDocumentTeamReport(raw);
  return prisma.report.create({
    data: { projectId, gini: report.gini, teamHealth: report.teamHealth, generatedAt: GENERATED_AT,
      content: JSON.stringify({ report, narrative: null, unmatchedLogins: [], scoringRulesVersion: 3, trigger: "auto" }) },
  });
}

async function insert(documentId: number, userId: number, position: number, length: number, timestamp: Date) {
  await prisma.editEvent.create({ data: { documentId, userId, eventType: "INSERT", position, length, timestamp, source: "LIVE", editType: "SUBSTANTIVE" } });
}

async function seedDocs(sourceType: "EDITOR" | "COMBINED") {
  const s = await setup(sourceType);
  const doc = await prisma.document.create({ data: { groupId: s.project.id } });
  await insert(doc.id, s.lead.id, 0, 2000, NOV10);           // one big insert -> docsOneGo
  await insert(doc.id, s.other.id, 2000, 120, NOV10);
  await insert(doc.id, s.other.id, 2120, 10, PRE_FIX);       // before the authorship fix -> docsDataApproximate
  const report = await saveDocsReport(s.project.id, doc.id, [s.lead, s.other]);
  await prisma.reportEvidenceId.create({ data: { code: "FT-TEST-01", projectId: s.project.id, reportId: report.id } });
  await prisma.auditLog.create({ data: { actorName: "x", action: "GROUP_REPO_CHANGED", targetType: "GROUP", targetId: String(s.project.id), createdAt: new Date("2026-11-13T00:00:00Z") } });
  return s;
}

const get = (id: number | string, u?: Parameters<typeof authHeaderFor>[0]) => {
  const r = request(app).get(`/api/projects/${id}/report`);
  return u ? r.set("Authorization", authHeaderFor(u)) : r;
};

/** Prisma operations for one request, from the E1-0 timing line. */
async function opsFor(fn: () => Promise<unknown>): Promise<number> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((l: unknown) => { lines.push(String(l)); });
  try { await fn(); await new Promise((r) => setTimeout(r, 30)); } finally { spy.mockRestore(); }
  const m = lines.find((l) => l.startsWith("[timing]"))?.match(/ q=(\d+)/);
  if (!m) throw new Error("no timing line");
  return Number(m[1]);
}

describe("GET /api/projects/:id/report: full body is unchanged", () => {
  // INT-028
  it("GITHUB group", async () => {
    const { instructor, project } = await setup("GITHUB");
    await saveGithubReport(project.id);
    const res = await get(project.id, instructor);
    expect(res.status).toBe(200);
    expect(norm(res.body)).toMatchSnapshot();
  });

  it("EDITOR group (docs approximate, one-go hint, evidence id, repo changed)", async () => {
    const { instructor, project } = await seedDocs("EDITOR");
    const res = await get(project.id, instructor);
    expect(res.status).toBe(200);
    expect(res.body.docsDataApproximate).toBe(true);
    expect(res.body.docsOneGo).toHaveLength(1);
    expect(res.body.evidenceReportId).toBe("FT-TEST-01");
    expect(res.body.repoChanged).toBe(true);
    expect(norm(res.body)).toMatchSnapshot();
  });

  // INT-015
  it("COMBINED group", async () => {
    const { instructor, project } = await seedDocs("COMBINED");
    const res = await get(project.id, instructor);
    expect(res.status).toBe(200);
    expect(norm(res.body)).toMatchSnapshot();
  });
});

describe("GET /api/projects/:id/report: error cases keep their order and wording", () => {
  it("401 without a token", async () => {
    const res = await get(1);
    expect(res.status).toBe(401);
  });

  it("400 for a bad id", async () => {
    const { instructor } = await setup("GITHUB");
    const res = await get("abc", instructor);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid project id" });
  });

  it("404 when the project does not exist", async () => {
    const { instructor } = await setup("GITHUB");
    const res = await get(999999999, instructor);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Project not found" });
  });

  it("403 for another instructor, even when a report exists", async () => {
    const { project } = await setup("GITHUB");
    await saveGithubReport(project.id);
    const { user: stranger } = await createUser({ systemRole: "INSTRUCTOR" });
    const res = await get(project.id, stranger);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You do not have access to this project" });
  });

  it("403 for a project with no assignment (no owner)", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const project = await createProject({ assignmentId: null });
    const res = await get(project.id, instructor);
    expect(res.status).toBe(403);
  });

  it("403 for a student", async () => {
    const { project, lead } = await setup("GITHUB");
    await saveGithubReport(project.id);
    const res = await get(project.id, lead);
    expect(res.status).toBe(403);
  });

  it("404 when nothing has been analyzed yet", async () => {
    const { instructor, project } = await setup("GITHUB");
    const res = await get(project.id, instructor);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "No report found — analyze this project first." });
  });

  it("500 when the stored report has no report data", async () => {
    const { instructor, project } = await setup("GITHUB");
    await prisma.report.create({ data: { projectId: project.id, gini: 0, teamHealth: "Healthy", generatedAt: GENERATED_AT, content: JSON.stringify({ narrative: "x" }) } });
    const res = await get(project.id, instructor);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Report data is missing — re-run Analyze." });
  });
});

describe("GET /api/projects/:id/report: Prisma operations (q= in the timing log)", () => {
  it("GITHUB group", async () => {
    const { instructor, project } = await setup("GITHUB");
    await saveGithubReport(project.id);
    const q = await opsFor(() => get(project.id, instructor));
    expect(q).toBe(EXPECTED_Q_GITHUB);
  });

  it("COMBINED group", async () => {
    const { instructor, project } = await seedDocs("COMBINED");
    const q = await opsFor(() => get(project.id, instructor));
    expect(q).toBe(EXPECTED_Q_COMBINED);
  });
});

const EXPECTED_Q_GITHUB = 7;    // was 6: the document lookup now runs in the first parallel batch for every group
const EXPECTED_Q_COMBINED = 10; // was 11: the duplicate document lookup is gone

import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { ScoredMember, TeamReport } from "@shared/types.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

vi.hoisted(() => { process.env.REQUEST_TIMING_LOG = "on"; });

// Characterisation test for GET /api/student/group/:projectId. The full body is pinned (snapshot written from the
// code BEFORE the E1-3 parallelisation) for a member and a leader of a GITHUB and a COMBINED group.
// Ids and creation times are replaced by tokens so the snapshot is stable.

const app = createApp();
const GENERATED_AT = new Date("2026-11-12T00:00:00Z");
const PRE_FIX = new Date("2026-09-01T00:00:00Z"); // before AUTHORSHIP_FIX_AT (default 2026-10-08)

const TOKEN_KEYS = new Set(["id", "userId", "projectId", "assignmentId", "joinedAt", "createdAt", "edpCode", "avatarUpdatedAt"]);
function norm(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) =>
      [k, TOKEN_KEYS.has(k) && x !== null && typeof x !== "object" ? `<${k}>` : norm(x)]));
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

async function seed(sourceType: "GITHUB" | "COMBINED") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType });
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: "Build it." } });
  await prisma.projectAttachment.create({ data: { assignmentId: asg.id, kind: "IMAGE", mime: "image/png", data: Buffer.from([1, 2, 3]), size: 3, filename: "brief.png", order: 0 } });
  const project = await createProject({ assignmentId: asg.id, groupName: "Group Eq" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lead" });
  const { user: member } = await createUser({ systemRole: "STUDENT", name: "Mem" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT", name: "Out" });
  const { user: applicant } = await createUser({ systemRole: "STUDENT", name: "App" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  await prisma.user.update({ where: { id: leader.id }, data: { githubUsername: "lead-gh" } });
  await prisma.user.update({ where: { id: member.id }, data: { githubUsername: "mem-gh" } });
  await prisma.task.create({ data: { projectId: project.id, number: 1, title: "T1", createdByUserId: leader.id, assignedToUserId: member.id, done: true, status: "DONE" } });
  await prisma.task.create({ data: { projectId: project.id, number: 2, title: "T2", createdByUserId: leader.id, assignedToUserId: member.id } });
  await prisma.roleSuggestion.create({ data: { userId: member.id, projectId: project.id, suggestedRoles: JSON.stringify(["DOCUMENTATION"]), status: "PENDING" } });
  await prisma.groupJoinRequest.create({ data: { userId: applicant.id, projectId: project.id, status: "PENDING" } });

  const members = [
    { n: "Lead", gh: "lead-gh", u: leader.id, share: 0.7, flags: ["overload"] },
    { n: "Mem", gh: "mem-gh", u: member.id, share: 0.3, flags: ["free-rider"] },
  ];
  const report = sourceType === "GITHUB"
    ? ({
        members: members.map((m) => ghMember({ studentName: m.n, githubUsername: m.gh, contributionShare: m.share, flags: m.flags as never })),
        memberCount: 2, gini: 0.4, teamHealth: "High Risk", deadlineWindowBasis: "activity-span",
      } satisfies TeamReport<ScoredMember>)
    : {
        members: members.map((m) => ({
          studentName: m.n, userId: m.u, githubUsername: m.gh, contributionShare: m.share, lastPhaseRatio: 0.3, flags: m.flags,
          githubContributionShare: m.share, documentContributionShare: 1 - m.share, wGitHub: 0.55, wDocs: 0.45,
          github: ghMember({ studentName: m.n, githubUsername: m.gh, contributionShare: m.share }),
          document: { studentName: m.n, userId: m.u, sessionCount: 3, activeDays: 2, retainedChars: 400, totalInsertedChars: 500, selfChurnRatio: 0.1, importedRetainedChars: 0, insertedImageCount: 0, contributionShare: 1 - m.share, flags: [] },
        })),
        memberCount: 2, gini: 0.4, teamHealth: "High Risk", deadlineWindowBasis: "activity-span",
      };
  await prisma.report.create({
    data: { projectId: project.id, gini: 0.4, teamHealth: "High Risk", generatedAt: GENERATED_AT,
      content: JSON.stringify({ report, narrative: "The work is shared unevenly.", unmatchedLogins: [], scoringRulesVersion: 3, trigger: "manual" }) },
  });
  if (sourceType === "COMBINED") {
    const doc = await prisma.document.create({ data: { groupId: project.id } });
    await prisma.editEvent.create({ data: { documentId: doc.id, userId: member.id, eventType: "INSERT", position: 0, length: 40, timestamp: PRE_FIX, source: "LIVE", editType: "SUBSTANTIVE" } });
  }
  return { project, leader, member, outsider };
}

const get = (id: number | string, u?: Parameters<typeof authHeaderFor>[0]) => {
  const r = request(app).get(`/api/student/group/${id}`);
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

describe("GET /api/student/group/:projectId: full body is unchanged", () => {
  for (const sourceType of ["GITHUB", "COMBINED"] as const) {
    it(`${sourceType}: member`, async () => {
      const { project, member } = await seed(sourceType);
      const res = await get(project.id, member);
      expect(res.status).toBe(200);
      expect(res.body.pendingCounts).toBeUndefined();
      expect(res.body.report.team).toBeUndefined();
      expect(norm(res.body)).toMatchSnapshot();
    });

    it(`${sourceType}: leader`, async () => {
      const { project, leader } = await seed(sourceType);
      const res = await get(project.id, leader);
      expect(res.status).toBe(200);
      expect(res.body.pendingCounts).toEqual({ joinRequests: 1, roleRequests: 1 });
      expect(res.body.report.team).toHaveLength(2);
      expect(norm(res.body)).toMatchSnapshot();
    });
  }

  it("COMBINED reports docsDataApproximate from the pre-fix edit event", async () => {
    const { project, member } = await seed("COMBINED");
    expect((await get(project.id, member)).body.docsDataApproximate).toBe(true);
  });

  it("GITHUB reports docsDataApproximate false", async () => {
    const { project, member } = await seed("GITHUB");
    expect((await get(project.id, member)).body.docsDataApproximate).toBe(false);
  });
});

describe("GET /api/student/group/:projectId: error cases keep their order and wording", () => {
  it("401 without a token", async () => {
    expect((await get(1)).status).toBe(401);
  });

  it("400 for a bad id", async () => {
    const { member } = await seed("GITHUB");
    const res = await get("abc", member);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid project id" });
  });

  it("403 for a student who is not a member", async () => {
    const { project, outsider } = await seed("COMBINED");
    const res = await get(project.id, outsider);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You are not a member of this group." });
  });

  it("403 for a project that does not exist (no membership)", async () => {
    const { member } = await seed("GITHUB");
    expect((await get(999999999, member)).status).toBe(403);
  });

  it("403 for an instructor (student route)", async () => {
    const { project } = await seed("GITHUB");
    const { user: inst } = await createUser({ systemRole: "INSTRUCTOR" });
    expect((await get(project.id, inst)).status).toBe(403);
  });

  it("404 when the project has no assignment", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject({ assignmentId: null });
    await createMembership(user.id, project.id, "MEMBER");
    const res = await get(project.id, user);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Project not found." });
  });

  it("no report yet: hasReport false, report null", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cls = await createClassSection(instructor.id);
    const asg = await createAssignment(cls.id, { sourceType: "COMBINED" });
    const project = await createProject({ assignmentId: asg.id });
    const { user } = await createUser({ systemRole: "STUDENT" });
    await createMembership(user.id, project.id, "LEADER");
    const res = await get(project.id, user);
    expect(res.status).toBe(200);
    expect(res.body.hasReport).toBe(false);
    expect(res.body.report).toBeNull();
    expect(res.body.pendingCounts).toEqual({ joinRequests: 0, roleRequests: 0 });
  });
});

describe("GET /api/student/group/:projectId: Prisma operations (q= in the timing log)", () => {
  it("member, COMBINED", async () => {
    const { project, member } = await seed("COMBINED");
    expect(await opsFor(() => get(project.id, member))).toBe(Q.memberCombined);
  });
  it("leader, COMBINED", async () => {
    const { project, leader } = await seed("COMBINED");
    expect(await opsFor(() => get(project.id, leader))).toBe(Q.leaderCombined);
  });
  it("member, GITHUB", async () => {
    const { project, member } = await seed("GITHUB");
    expect(await opsFor(() => get(project.id, member))).toBe(Q.memberGithub);
  });
  it("leader, GITHUB", async () => {
    const { project, leader } = await seed("GITHUB");
    expect(await opsFor(() => get(project.id, leader))).toBe(Q.leaderGithub);
  });
});

const Q = { memberCombined: 7, leaderCombined: 11, memberGithub: 7, leaderGithub: 11 }; // after E1-3 (was 8, 12, 6, 10)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted: the provider SDK and the two AI-review pipelines are replaced by test doubles.
// Everything else (routes, auth, Prisma on the test database, the daily-quota limiter) is real.
const h = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
  return { generateContent: vi.fn(), memberDeps: null as unknown, briefDeps: null as unknown };
});
// The shared test setup replaces gemini.js; the narrative route needs the real one (the SDK is mocked instead).
vi.unmock("../src/lib/gemini.js");
vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent: h.generateContent };
  },
}));
// The AI review route calls each pipeline with only the group id; these wrappers hand it mocked GitHub/Gemini deps.
vi.mock("../src/lib/aiReview/memberSummaries.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/aiReview/memberSummaries.js")>();
  return { ...real, generateMemberSummaries: (projectId: number) => real.generateMemberSummaries(projectId, h.memberDeps as never) };
});
vi.mock("../src/lib/aiReview/briefComparison.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/lib/aiReview/briefComparison.js")>();
  return { ...real, generateBriefComparison: (projectId: number) => real.generateBriefComparison(projectId, h.briefDeps as never) };
});

import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { waitForReview } from "../src/lib/aiReview/reviewLock.js";
import { noteDailyQuotaHit, resetDailyBudgetForTests } from "../src/lib/aiReview/limiter.js";
import type { MemberSummaryDeps } from "../src/lib/aiReview/memberSummaries.js";
import type { BriefDeps } from "../src/lib/aiReview/briefComparison.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";
import { setup as evidenceSetup, saveReport as saveEvidenceReport } from "./helpers/evidenceFixtures.js";

// Integration flows: each test crosses two modules (route + database, route + auth, route + mocked AI).
// Real Prisma test database; Gemini and GitHub are mocked. One new file so one screenshot shows them all.
const app = createApp();

type AuthUser = Parameters<typeof authHeaderFor>[0];
const as = (r: request.Test, u: AuthUser) => r.set("Authorization", authHeaderFor(u));

function extractRefreshCookie(res: request.Response): string {
  const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
  const raw = setCookie?.find((c) => c.startsWith("ft_refresh_token="));
  if (!raw) throw new Error("No refresh cookie set on response");
  return raw.split(";")[0];
}

// A stored GitHub report with two members; the first carries a flag and matches the student's githubUsername.
const member = (name: string, share: number, flags: string[]) => ({
  studentName: name, githubUsername: name.toLowerCase(), commits: 10, additions: 100, deletions: 5, churn: 105, activeDays: 4,
  contributionShare: share, flags,
});
const teamReport = {
  members: [member("Ana", 0.2, ["free-rider"]), member("Ben", 0.8, ["overload"])],
  memberCount: 2, gini: 0.3, teamHealth: "Moderate Risk",
};

async function groupWithReport() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType: "GITHUB" });
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: "Build a login page." } });
  const project = await createProject({ assignmentId: asg.id });
  const { user: ana } = await createUser({ systemRole: "STUDENT", name: "Ana" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben" });
  await prisma.user.update({ where: { id: ana.id }, data: { githubUsername: "ana" } });
  await prisma.user.update({ where: { id: ben.id }, data: { githubUsername: "ben" } });
  await createMembership(ana.id, project.id, "LEADER");
  await createMembership(ben.id, project.id, "MEMBER");
  const report = await prisma.report.create({
    data: { projectId: project.id, gini: teamReport.gini, teamHealth: teamReport.teamHealth, content: JSON.stringify({ report: teamReport }) },
  });
  return { instructor, project, ana, ben, report };
}

// What a reader of the report sees as its numbers: shares, flags, Gini, team health.
const reportNumbers = async (projectId: number, instructor: AuthUser) => {
  const res = await as(request(app).get(`/api/projects/${projectId}/report`), instructor);
  expect(res.status).toBe(200);
  const rep = res.body.report ?? res.body.content?.report;
  expect(rep).toBeTruthy();
  return { members: rep.members.map((m: { studentName: string; contributionShare: number; flags: string[] }) => ({ n: m.studentName, s: m.contributionShare, f: m.flags })), gini: rep.gini, health: rep.teamHealth };
};

describe("integration flows", () => {
  // INT-005
  it("admin changes a user's role; after token refresh the user reaches the new role's route and is blocked from the old one", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: target, password } = await createUser({ systemRole: "STUDENT", email: "rolechange.int@example.com" });

    const login = await request(app).post("/api/auth/login").send({ email: target.email, password });
    expect(login.status).toBe(200);
    const cookie = extractRefreshCookie(login);
    const staleToken = login.body.token as string;
    expect((await request(app).get("/api/student/classes").set("Authorization", `Bearer ${staleToken}`)).status).toBe(200);

    const patch = await as(request(app).patch(`/api/admin/users/${target.id}/role`), admin).send({ role: "INSTRUCTOR" });
    expect(patch.status).toBe(200);
    expect(patch.body.systemRole).toBe("INSTRUCTOR");

    // The old token still says STUDENT: it fails closed on the instructor route until refreshed.
    expect((await request(app).get("/api/classes").set("Authorization", `Bearer ${staleToken}`)).status).toBe(403);

    const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", cookie);
    expect(refreshed.status).toBe(200);
    const fresh = `Bearer ${refreshed.body.token as string}`;
    expect((await request(app).get("/api/classes").set("Authorization", fresh)).status).toBe(200); // new role's route
    expect((await request(app).get("/api/student/classes").set("Authorization", fresh)).status).toBe(403); // old role's route
  });

  // INT-006
  it("after a deactivate and a role change, the audit log lists both rows newest first, and the action filter narrows it", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN", name: "Audit Admin" });
    const { user: target } = await createUser({ systemRole: "STUDENT" });

    expect((await as(request(app).patch(`/api/admin/users/${target.id}/status`), admin).send({ active: false })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 20));
    expect((await as(request(app).patch(`/api/admin/users/${target.id}/role`), admin).send({ role: "INSTRUCTOR" })).status).toBe(200);

    const all = await as(request(app).get("/api/admin/audit"), admin);
    expect(all.status).toBe(200);
    expect(all.body.entries.map((e: { action: string }) => e.action)).toEqual(["ROLE_CHANGED", "USER_DEACTIVATED"]);
    for (const e of all.body.entries) {
      expect(e.actorName).toBe("Audit Admin");
      expect(e.targetType).toBe("USER");
      expect(e.targetId).toBe(String(target.id));
      expect(Number.isNaN(Date.parse(e.createdAt))).toBe(false);
    }
    expect(Date.parse(all.body.entries[0].createdAt)).toBeGreaterThanOrEqual(Date.parse(all.body.entries[1].createdAt));

    const filtered = await as(request(app).get("/api/admin/audit?action=USER_DEACTIVATED"), admin);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.entries.map((e: { action: string }) => e.action)).toEqual(["USER_DEACTIVATED"]);
  });

  // INT-007
  it("a student joins with the class code and then sees that class, with the same subject and code, in their class list", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cs = await createClassSection(instructor.id, { subjectCode: "CC-INT7", edpCode: "70007" });
    await prisma.classSection.update({ where: { id: cs.id }, data: { joinCode: "INTSEVEN" } });
    const { user: student } = await createUser({ systemRole: "STUDENT" });

    expect((await as(request(app).get("/api/student/classes"), student)).body.classes).toEqual([]);

    const join = await as(request(app).post("/api/join/class"), student).send({ joinCode: "intseven" });
    expect(join.status).toBe(201);
    expect(join.body.classSectionId).toBe(cs.id);

    const list = await as(request(app).get("/api/student/classes"), student);
    expect(list.status).toBe(200);
    expect(list.body.classes).toHaveLength(1);
    expect(list.body.classes[0]).toMatchObject({ id: cs.id, subjectCode: "CC-INT7", subjectName: "Test Subject", edpCode: "70007", joinCode: "INTSEVEN" });
    expect(await prisma.classEnrollment.count({ where: { userId: student.id, classSectionId: cs.id } })).toBe(1);
  });

  // INT-008
  it("a project the instructor creates appears in an enrolled student's class view with the same title and deadline", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cs = await createClassSection(instructor.id);
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    await prisma.classEnrollment.create({ data: { userId: student.id, classSectionId: cs.id } });

    const before = await as(request(app).get(`/api/student/classes/${cs.id}/projects`), student);
    expect(before.status).toBe(200);
    expect(before.body.assignments).toEqual([]);

    const deadline = "2027-03-15T08:00:00.000Z";
    const created = await as(request(app).post("/api/assignments"), instructor).send({
      classSectionId: cs.id, title: "Sprint Review Project", deadline, maxGroupSize: 4, sourceType: "COMBINED",
      description: "Build and document a small web app.",
    });
    expect(created.status).toBe(201);

    const after = await as(request(app).get(`/api/student/classes/${cs.id}/projects`), student);
    expect(after.status).toBe(200);
    expect(after.body.assignments).toHaveLength(1);
    expect(after.body.assignments[0]).toMatchObject({ id: created.body.id, title: "Sprint Review Project", deadline, sourceType: "COMBINED", maxGroupSize: 4 });
  });

  // INT-012
  it("after the instructor changes the leader, the new leader gets the leader-only parts and the old leader loses them", async () => {
    const { instructor, project, leader: oldLeader, member: newLeader } = await evidenceSetup("GITHUB");
    await saveEvidenceReport(project.id, "GITHUB");
    const { user: applicant } = await createUser({ systemRole: "STUDENT" });
    await prisma.groupJoinRequest.create({ data: { userId: applicant.id, projectId: project.id } });

    const group = (u: AuthUser) => as(request(app).get(`/api/student/group/${project.id}`), u);
    const evidence = (u: AuthUser) => as(request(app).get(`/api/groups/${project.id}/evidence-report`), u);

    // Before: the old leader has the leader-only parts, the other member does not.
    expect((await group(oldLeader)).body.pendingCounts).toEqual({ joinRequests: 1, roleRequests: 0 });
    expect((await evidence(oldLeader)).status).toBe(200);
    expect((await evidence(newLeader)).status).toBe(403);

    const reassign = await as(request(app).post(`/api/groups/${project.id}/reassign-leader`), instructor).send({ userId: newLeader.id });
    expect(reassign.status).toBe(200);
    expect(reassign.body.newLeaderId).toBe(newLeader.id);

    const asNew = await group(newLeader);
    expect(asNew.status).toBe(200);
    expect(asNew.body.membership.role).toBe("LEADER");
    expect(asNew.body.pendingCounts).toEqual({ joinRequests: 1, roleRequests: 0 });
    expect(asNew.body.report.team).toBeTruthy();
    expect((await evidence(newLeader)).status).toBe(200);

    const asOld = await group(oldLeader);
    expect(asOld.status).toBe(200);
    expect(asOld.body.membership.role).toBe("MEMBER");
    expect(asOld.body).not.toHaveProperty("pendingCounts");
    expect(asOld.body.report.team).toBeUndefined();
    const denied = await evidence(oldLeader);
    expect(denied.status).toBe(403);
  });

  describe("daily AI limit (INT-023)", () => {
    beforeEach(() => {
      process.env.AI_REVIEW_ENABLED = "true";
      h.generateContent.mockReset();
      h.generateContent.mockResolvedValue({ text: "Balanced team." });
    });
    afterEach(() => {
      delete process.env.AI_REVIEW_ENABLED;
      resetDailyBudgetForTests();
      h.memberDeps = null;
      h.briefDeps = null;
    });

    const commit = (sha: string, login: string) => ({ sha, message: `msg ${sha}`, authorLogin: login, committedAt: "2026-10-20T00:00:00Z" });
    const memberDeps = (shas: Array<[string, string]>, generate: MemberSummaryDeps["generate"]): MemberSummaryDeps => ({
      listCommits: vi.fn().mockResolvedValue(shas.map(([sha, login]) => commit(sha, login))),
      fetchEvidence: vi.fn(async (_o: string, _r: string, _t: string, sha: string) => ({
        sha, message: `msg ${sha}`, authorLogin: null, files: [{ path: `src/${sha}.ts`, added: 5, removed: 1, addedLines: ["x"], removedLines: [] }], skippedFiles: 0,
      })),
      loadDocs: vi.fn().mockResolvedValue({ hasDocument: false, pieces: [], spans: [] }),
      generate,
      githubToken: "tok",
    }) as MemberSummaryDeps;
    const happyGenerate = () => vi.fn(async (req: { prompt: string; validate: (v: unknown) => unknown }) => {
      const data = JSON.parse(req.prompt.slice(req.prompt.indexOf("\n") + 1));
      if (data.commits) return req.validate({ commits: data.commits.map((c: { sha: string }) => ({ sha: c.sha, summary: `Added file ${c.sha}.` })) });
      return req.validate({ members: data.members.map((m: { member: string }) => ({ member: m.member, summary: "Added the login page." })) });
    }) as unknown as MemberSummaryDeps["generate"];

    // INT-023
    it("daily limit used up: the narrative route refuses with the plain limit message and reset time, and the report's scores and flags do not change", async () => {
      const s = await groupWithReport();
      const before = await reportNumbers(s.project.id, s.instructor);

      noteDailyQuotaHit(3 * 3_600_000); // the provider says the daily limit is reached; resets in about 3 hours
      const res = await as(request(app).post(`/api/projects/${s.project.id}/narrative?regenerate=true`), s.instructor);
      expect(res.status).toBe(429);
      expect(res.body.code).toBe("AI_QUOTA_DAILY");
      expect(res.body.error).toMatch(/daily limit was reached.*resets in about \d+ hours?\. Try again later\./);
      const retryIn = Date.parse(res.body.retryAt) - Date.now();
      expect(retryIn).toBeGreaterThan(2.9 * 3_600_000);
      expect(retryIn).toBeLessThanOrEqual(3 * 3_600_000 + 1000);
      expect(h.generateContent).not.toHaveBeenCalled();

      expect(await reportNumbers(s.project.id, s.instructor)).toEqual(before);
    });

    // INT-023
    it("daily limit used up: the AI review route makes no AI call, keeps the last good findings and returns the limit code and reset time; scores and flags do not change", async () => {
      const s = await groupWithReport();
      const real = await vi.importActual<typeof import("../src/lib/aiReview/memberSummaries.js")>("../src/lib/aiReview/memberSummaries.js");
      const first = await real.generateMemberSummaries(s.project.id, memberDeps([["a1", "ana"], ["b1", "ben"]], happyGenerate()));
      expect(first!.result.status).toBe("OK");
      const before = await reportNumbers(s.project.id, s.instructor);

      noteDailyQuotaHit(3 * 3_600_000);
      const generate = vi.fn() as unknown as MemberSummaryDeps["generate"];
      h.memberDeps = memberDeps([["a1", "ana"], ["a2", "ana"], ["b1", "ben"]], generate); // a new commit: the run needs a call
      const briefGenerate = vi.fn() as unknown as BriefDeps["generate"];
      h.briefDeps = {
        fetchTree: vi.fn().mockResolvedValue(["README.md"]), fetchFile: vi.fn().mockResolvedValue(null),
        loadDocs: vi.fn().mockResolvedValue({ hasDocument: false, pieces: [], spans: [] }),
        generate: briefGenerate, githubToken: "tok", loadBriefFiles: vi.fn().mockResolvedValue({ usable: [], skipped: [] }),
      } as BriefDeps;

      const started = await as(request(app).post(`/api/groups/${s.project.id}/ai-review`), s.instructor);
      expect(started.status).toBe(202);
      await waitForReview(s.project.id);

      expect(generate).not.toHaveBeenCalled();
      expect(briefGenerate).not.toHaveBeenCalled();
      const res = await as(request(app).get(`/api/groups/${s.project.id}/ai-review`), s.instructor);
      expect(res.status).toBe(200);
      expect(res.body.summaries).toHaveLength(2); // the last good findings are still shown
      expect(res.body.refreshFailed.findings).toMatchObject({ errorCode: "AI_QUOTA_DAILY" });
      // The page words this limit in the viewer's own clock from this reset time (no provider text is sent).
      const retryIn = Date.parse(res.body.aiLimit.retryAt) - Date.now();
      expect(retryIn).toBeGreaterThan(2.9 * 3_600_000);
      expect(retryIn).toBeLessThanOrEqual(3 * 3_600_000 + 1000);

      expect(await reportNumbers(s.project.id, s.instructor)).toEqual(before);
    });
  });

  // INT-027
  it("a dispute resolved as accepted, and one dismissed, store their outcome per flag and leave the report's scores and flags unchanged", async () => {
    // Scope: the "Reviewed: accepted / upheld" badge itself is drawn by the client from this data
    // (ProjectDetailPage builds the outcome map from GET /api/projects/:id/disputes) and is tested client-side
    // in report.test.tsx (DSP-06). This test covers the server half: outcome stored, returned, scores unchanged.
    const s = await groupWithReport();
    const before = await reportNumbers(s.project.id, s.instructor);

    const filed = async (student: AuthUser) => {
      const res = await as(request(app).post("/api/disputes"), student).send({ projectId: s.project.id, reason: "I did the design work offline." });
      expect(res.status).toBe(201);
      return res.body.id as number;
    };
    const anaDispute = await filed(s.ana);
    const benDispute = await filed(s.ben);

    const accepted = await as(request(app).post(`/api/disputes/${anaDispute}/resolve`), s.instructor).send({ status: "RESOLVED", instructorResponse: "Accepted: the offline work is noted." });
    expect(accepted.status).toBe(200);
    const dismissed = await as(request(app).post(`/api/disputes/${benDispute}/resolve`), s.instructor).send({ status: "DISMISSED", instructorResponse: "The result stands." });
    expect(dismissed.status).toBe(200);

    const list = await as(request(app).get(`/api/projects/${s.project.id}/disputes`), s.instructor);
    expect(list.status).toBe(200);
    const byName = new Map<string, { status: string; disputedFlags: string; instructorResponse: string }>(
      list.body.disputes.map((d: { memberName: string; status: string; disputedFlags: string; instructorResponse: string }) => [d.memberName, d]),
    );
    expect(byName.get("Ana")).toMatchObject({ status: "RESOLVED", instructorResponse: "Accepted: the offline work is noted." });
    expect(JSON.parse(byName.get("Ana")!.disputedFlags)).toEqual(["free-rider"]);
    expect(byName.get("Ben")).toMatchObject({ status: "DISMISSED", instructorResponse: "The result stands." });
    expect(JSON.parse(byName.get("Ben")!.disputedFlags)).toEqual(["overload"]);

    expect(await reportNumbers(s.project.id, s.instructor)).toEqual(before);
    const stored = await prisma.report.findUniqueOrThrow({ where: { id: s.report.id } });
    expect(JSON.parse(stored.content!).report).toEqual(teamReport);
  });
});

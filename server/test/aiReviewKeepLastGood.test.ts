import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { generateMemberSummaries, type MemberSummaryDeps } from "../src/lib/aiReview/memberSummaries.js";
import { generateBriefComparison, type BriefDeps } from "../src/lib/aiReview/briefComparison.js";
import { AiReviewError } from "../src/lib/geminiClient.js";

// A failed run must not erase the last good result: the card stays, with a note.
const app = createApp();

beforeEach(() => { process.env.AI_REVIEW_ENABLED = "true"; });
afterEach(() => { delete process.env.AI_REVIEW_ENABLED; });

const get = (id: number, u: { id: number; email: string; name: string; systemRole: never }) =>
  request(app).get(`/api/groups/${id}/ai-review`).set("Authorization", authHeaderFor(u));

async function setup(sourceType: "GITHUB" | "EDITOR") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType });
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: "Build a login page." } });
  const project = await createProject({ assignmentId: asg.id, repoUrl: sourceType === "EDITOR" ? null : "https://github.com/example/repo" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lia Leader" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Reyes" });
  await prisma.user.update({ where: { id: leader.id }, data: { githubUsername: "lialeader" } });
  await prisma.user.update({ where: { id: ben.id }, data: { githubUsername: "benreyes" } });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  return { instructor, project, leader, ben, report };
}

const quotaError = () => new AiReviewError("AI_QUOTA_DAILY", undefined, 4 * 3_600_000);
const failingGenerate = (err: Error) => vi.fn(async () => { throw err; }) as never;

const commit = (sha: string, login: string) => ({ sha, message: `msg ${sha}`, authorLogin: login, committedAt: "2026-10-20T00:00:00Z" });
const summaryDeps = (generate: MemberSummaryDeps["generate"]): MemberSummaryDeps => ({
  listCommits: vi.fn().mockResolvedValue([commit("a1", "lialeader"), commit("b1", "benreyes")]),
  fetchEvidence: vi.fn(async (_o: string, _r: string, _t: string, sha: string) => ({
    sha, message: `msg ${sha}`, authorLogin: null, files: [{ path: `src/${sha}.ts`, added: 5, removed: 1, addedLines: ["x"], removedLines: [] }], skippedFiles: 0,
  })),
  loadDocs: vi.fn().mockResolvedValue({ hasDocument: false, pieces: [], spans: [] }),
  generate,
  githubToken: "tok",
}) as MemberSummaryDeps;

function happyGenerate() {
  return vi.fn(async (req: { prompt: string; validate: (v: unknown) => unknown }) => {
    const data = JSON.parse(req.prompt.slice(req.prompt.indexOf("\n") + 1));
    if (data.commits) return req.validate({ commits: data.commits.map((c: { sha: string }) => ({ sha: c.sha, summary: `Added file ${c.sha}.` })) });
    return req.validate({ members: data.members.map((m: { member: string }) => ({ member: m.member, summary: "Added the login page and fixed two form errors." })) });
  }) as unknown as MemberSummaryDeps["generate"];
}

describe("member findings: a failed run keeps the last good result", () => {
  it("leaves the stored findings and their date untouched, notes the failure, and clears the note on success", async () => {
    const s = await setup("GITHUB");
    await generateMemberSummaries(s.project.id, summaryDeps(happyGenerate()));
    const good = await prisma.aiReportReview.findFirstOrThrow({ where: { reportId: s.report.id, kind: "MEMBER_SUMMARIES" } });
    expect(good.status).toBe("OK");

    await generateMemberSummaries(s.project.id, summaryDeps(failingGenerate(quotaError())));
    const kept = await prisma.aiReportReview.findFirstOrThrow({ where: { reportId: s.report.id, kind: "MEMBER_SUMMARIES" } });
    expect(kept.status).toBe("OK");
    expect(kept.createdAt.getTime()).toBe(good.createdAt.getTime());
    const { lastAttempt, ...keptContent } = kept.content as { lastAttempt?: { errorCode: string; retryAt?: string; keptLast?: boolean } };
    const { lastAttempt: _none, ...goodContent } = good.content as { lastAttempt?: unknown };
    expect(keptContent).toEqual(goodContent);
    expect(lastAttempt).toMatchObject({ errorCode: "AI_QUOTA_DAILY", keptLast: true });
    expect(Date.parse(lastAttempt!.retryAt!)).toBeGreaterThan(Date.now() + 3 * 3_600_000);

    const asInstructor = await get(s.project.id, s.instructor as never);
    expect(asInstructor.body.summaries).toHaveLength(2);
    expect(asInstructor.body.refreshFailed.findings).toMatchObject({ errorCode: "AI_QUOTA_DAILY", shownFrom: good.createdAt.toISOString() });
    expect(asInstructor.body.aiLimit.retryAt).toBe(lastAttempt!.retryAt);

    // A member sees their own summary and no failure note.
    const asMember = await get(s.project.id, s.ben as never);
    expect(asMember.body.summaries).toHaveLength(1);
    expect(asMember.body).not.toHaveProperty("refreshFailed");

    await generateMemberSummaries(s.project.id, summaryDeps(happyGenerate()));
    const fresh = await prisma.aiReportReview.findFirstOrThrow({ where: { reportId: s.report.id, kind: "MEMBER_SUMMARIES" } });
    expect(fresh.content).not.toHaveProperty("lastAttempt");
    expect((await get(s.project.id, s.instructor as never)).body).not.toHaveProperty("refreshFailed");
  });

  it("with no earlier good result, a failed run is stored as failed as before", async () => {
    const s = await setup("GITHUB");
    await generateMemberSummaries(s.project.id, summaryDeps(failingGenerate(new AiReviewError("AI_UNAVAILABLE"))));
    const row = await prisma.aiReportReview.findFirstOrThrow({ where: { reportId: s.report.id, kind: "MEMBER_SUMMARIES" } });
    expect(row.status).toBe("FAILED");
    expect(row.errorCode).toBe("AI_UNAVAILABLE");
  });
});

describe("instructions check: a failed run keeps the card", () => {
  const briefDeps = (generate: BriefDeps["generate"]): BriefDeps => ({
    fetchTree: vi.fn().mockResolvedValue([]),
    fetchFile: vi.fn().mockResolvedValue(null),
    loadDocs: vi.fn().mockResolvedValue({ hasDocument: false, pieces: [], spans: [] }),
    generate,
    githubToken: "tok",
    listCommits: vi.fn().mockResolvedValue([]),
    loadBriefFiles: vi.fn().mockResolvedValue({ usable: [], skipped: [] }),
  }) as BriefDeps;

  it("the instructor and the leader still see the check, with the note; the instructor can try again", async () => {
    const s = await setup("EDITOR");
    const seeded = await prisma.aiReportReview.create({
      data: {
        reportId: s.report.id, kind: "BRIEF_COMPARISON", status: "OK", promptVersion: "x", model: "m", briefHash: "h",
        content: { requirements: [{ text: "A login page", status: "FOUND", evidence: [] }], aiAddressedCount: 0 },
      },
    });

    await generateBriefComparison(s.project.id, briefDeps(failingGenerate(quotaError())));
    const row = await prisma.aiReportReview.findFirstOrThrow({ where: { id: seeded.id } });
    expect(row.status).toBe("OK");
    expect(row.createdAt.getTime()).toBe(seeded.createdAt.getTime());
    expect((row.content as { requirements: unknown[] }).requirements).toHaveLength(1);
    expect(row.content).toMatchObject({ lastAttempt: { errorCode: "AI_QUOTA_DAILY", keptLast: true } });

    const asInstructor = await get(s.project.id, s.instructor as never);
    expect(asInstructor.body.briefCheck.requirements).toHaveLength(1);
    expect(asInstructor.body).not.toHaveProperty("briefFailed");
    expect(asInstructor.body.refreshFailed.brief).toMatchObject({ errorCode: "AI_QUOTA_DAILY", shownFrom: seeded.createdAt.toISOString() });
    expect(asInstructor.body.canGenerate).toBe(true);

    const asLeader = await get(s.project.id, s.leader as never);
    expect(asLeader.body.briefCheck.requirements).toHaveLength(1);
    expect(asLeader.body.refreshFailed.brief.errorCode).toBe("AI_QUOTA_DAILY");
    expect(asLeader.body.canGenerate).toBe(false);

    const asMember = await get(s.project.id, s.ben as never);
    expect(asMember.body).not.toHaveProperty("briefCheck");
    expect(asMember.body).not.toHaveProperty("refreshFailed");
  });
});

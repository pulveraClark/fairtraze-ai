import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { generateMemberSummaries, type MemberSummaryDeps } from "../src/lib/aiReview/memberSummaries.js";
import { generateBriefComparison, type BriefDeps } from "../src/lib/aiReview/briefComparison.js";
import { AiReviewError } from "../src/lib/geminiClient.js";
import { lastUpToDate, recordUpToDate, startReview, waitForReview } from "../src/lib/aiReview/reviewLock.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

// "Nothing changed" costs zero AI calls, decided from reads only, before stage 1.
afterEach(() => { delete process.env.GEMINI_MODEL; delete process.env.AI_REVIEW_ENABLED; });

async function setup(sourceType: "GITHUB" | "COMBINED" = "GITHUB", description = "The app has a login page.") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType });
  await prisma.assignment.update({ where: { id: asg.id }, data: { description } });
  const project = await createProject({ assignmentId: asg.id, repoUrl: "https://github.com/example/repo" });
  const { user: ana } = await createUser({ systemRole: "STUDENT", name: "Ana Cruz" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Reyes" });
  await prisma.user.update({ where: { id: ana.id }, data: { githubUsername: "anacruz" } });
  await prisma.user.update({ where: { id: ben.id }, data: { githubUsername: "benreyes" } });
  await createMembership(ana.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  return { instructor, project, ana, ben, report };
}

const commit = (sha: string, login: string) => ({ sha, message: `msg ${sha}`, authorLogin: login, committedAt: "2026-10-20T00:00:00Z" });
const calls = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls.length;

function happyGenerate() {
  return vi.fn(async (req: { prompt: string; validate: (v: unknown) => unknown }) => {
    const data = JSON.parse(req.prompt.slice(req.prompt.indexOf("\n") + 1));
    if (data.commits) return req.validate({ commits: data.commits.map((c: { sha: string }) => ({ sha: c.sha, summary: `Added file ${c.sha}.` })) });
    return req.validate({ members: data.members.map((m: { member: string }) => ({ member: m.member, summary: "Added the login page and fixed two form errors." })) });
  }) as unknown as MemberSummaryDeps["generate"];
}

function memberDeps(shas: string[], generate = happyGenerate()): MemberSummaryDeps {
  return {
    listCommits: vi.fn().mockResolvedValue(shas.map((s) => commit(s, s.startsWith("b") ? "benreyes" : "anacruz"))),
    fetchEvidence: vi.fn(async (_o: string, _r: string, _t: string, sha: string) => ({
      sha, message: `msg ${sha}`, authorLogin: null, files: [{ path: `src/${sha}.ts`, added: 5, removed: 1, addedLines: ["x"], removedLines: [] }], skippedFiles: 0,
    })),
    loadDocs: vi.fn().mockResolvedValue({ hasDocument: false, pieces: [], spans: [] }),
    generate,
    githubToken: "tok",
  } as MemberSummaryDeps;
}

const stored = (reportId: number, kind: "MEMBER_SUMMARIES" | "BRIEF_COMPARISON") =>
  prisma.aiReportReview.findFirstOrThrow({ where: { reportId, kind } });

describe("member findings: unchanged inputs cost 0 AI calls, stage 1 included", () => {
  it("a second run with the same commits makes no AI call and no evidence fetch, even with no digest cache", async () => {
    const { project, report } = await setup();
    const first = memberDeps(["a1", "a2", "b1"]);
    await generateMemberSummaries(project.id, first);
    expect(calls(first.generate)).toBeGreaterThan(1); // commit batch + rollup
    const good = await stored(report.id, "MEMBER_SUMMARIES");
    expect(good.status).toBe("OK");

    // Even with the digest cache gone (so stage 1 would have to call the AI again), nothing is called.
    await prisma.aiCommitDigest.deleteMany({ where: { projectId: project.id } });
    const second = memberDeps(["a1", "a2", "b1"]);
    const out = await generateMemberSummaries(project.id, second);
    expect(calls(second.generate)).toBe(0);
    expect(calls(second.fetchEvidence)).toBe(0);
    expect(out!.result.reused?.since).toBe(good.createdAt.toISOString());
    const after = await stored(report.id, "MEMBER_SUMMARIES");
    expect(after.createdAt.getTime()).toBe(good.createdAt.getTime());
    expect(after.content).toEqual(good.content);
  });

  it("a new commit, a different model, or a changed prompt version makes calls again", async () => {
    const { project } = await setup();
    await generateMemberSummaries(project.id, memberDeps(["a1", "b1"]));

    const withNewCommit = memberDeps(["a1", "a2", "b1"]);
    await generateMemberSummaries(project.id, withNewCommit);
    expect(calls(withNewCommit.generate)).toBeGreaterThan(0);

    process.env.GEMINI_MODEL = "some-other-model";
    const otherModel = memberDeps(["a1", "a2", "b1"]);
    await generateMemberSummaries(project.id, otherModel);
    expect(calls(otherModel.generate)).toBeGreaterThan(0);
  });

  it("Docs text is part of the fingerprint", async () => {
    const { project, ana } = await setup("COMBINED");
    const docs = (text: string) => ({
      hasDocument: true,
      pieces: [{ start: 0, end: text.length, text, heading: "Intro", isHeading: false }],
      spans: [{ userId: ana.id, start: 0, end: text.length }],
    });
    const run = async (text: string) => {
      const d = memberDeps(["a1"]);
      d.loadDocs = vi.fn().mockResolvedValue(docs(text)) as never;
      await generateMemberSummaries(project.id, d);
      return calls(d.generate);
    };
    expect(await run("We wrote the introduction of the survey report today.")).toBeGreaterThan(0);
    expect(await run("We wrote the introduction of the survey report today.")).toBe(0);
    expect(await run("We rewrote the introduction of the survey report today.")).toBeGreaterThan(0);
  });

  it("a failed last run is never unchanged: the next run with the original inputs calls the AI again", async () => {
    const { project } = await setup();
    await generateMemberSummaries(project.id, memberDeps(["a1", "b1"]));
    // A run on new inputs fails; the good result is kept with a failure note.
    await generateMemberSummaries(project.id, memberDeps(["a1", "a2", "b1"], vi.fn(async () => { throw new AiReviewError("AI_TIMEOUT"); }) as never));
    const again = memberDeps(["a1", "b1"]);
    await generateMemberSummaries(project.id, again);
    expect(calls(again.generate)).toBeGreaterThan(0);
  });

  it("a partial last run is never unchanged", async () => {
    const { project, report } = await setup();
    await generateMemberSummaries(project.id, memberDeps(["a1", "b1"]));
    await prisma.aiReportReview.update({ where: { reportId_kind: { reportId: report.id, kind: "MEMBER_SUMMARIES" } }, data: { status: "PARTIAL" } });
    const again = memberDeps(["a1", "b1"]);
    await generateMemberSummaries(project.id, again);
    expect(calls(again.generate)).toBeGreaterThan(0);
  });

  it("after a new analysis, the reused result moves to the newest report and keeps its date", async () => {
    const { project, report } = await setup();
    await generateMemberSummaries(project.id, memberDeps(["a1", "b1"]));
    const good = await stored(report.id, "MEMBER_SUMMARIES");
    const newer = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });

    const again = memberDeps(["a1", "b1"]);
    await generateMemberSummaries(project.id, again);
    expect(calls(again.generate)).toBe(0);
    const moved = await stored(newer.id, "MEMBER_SUMMARIES");
    expect(moved.id).toBe(good.id);
    expect(moved.createdAt.getTime()).toBe(good.createdAt.getTime());
    expect(await prisma.aiReportReview.count({ where: { reportId: report.id, kind: "MEMBER_SUMMARIES" } })).toBe(0);
  });
});

describe("instructions check: unchanged inputs cost 0 AI calls", () => {
  const briefDeps = (generate: BriefDeps["generate"], tree = ["README.md", "src/Login.tsx"]): BriefDeps => ({
    fetchTree: vi.fn().mockResolvedValue(tree),
    fetchFile: vi.fn(async () => "export const Login = () => null;"),
    loadDocs: vi.fn().mockResolvedValue({ hasDocument: false, pieces: [], spans: [] }),
    generate,
    githubToken: "tok",
    loadBriefFiles: vi.fn().mockResolvedValue({ usable: [], skipped: [] }),
  }) as BriefDeps;
  const answer = () => vi.fn(async (req: { validate: (v: unknown) => unknown }) =>
    req.validate({ requirements: [{ text: "A login page", status: "NOT_FOUND", evidence: [], sourceQuote: "The app has a login page." }] })) as unknown as BriefDeps["generate"];

  it("same brief, files and prompt: no call; a changed brief or file list: a call", async () => {
    const { project, report } = await setup("GITHUB");
    const first = briefDeps(answer());
    await generateBriefComparison(project.id, first);
    expect(calls(first.generate)).toBe(1);
    expect((await stored(report.id, "BRIEF_COMPARISON")).status).toBe("OK");

    const same = briefDeps(answer());
    const out = await generateBriefComparison(project.id, same);
    expect(calls(same.generate)).toBe(0);
    expect(out!.result.reused).toBeTruthy();

    const newFile = briefDeps(answer(), ["README.md", "src/Login.tsx", "src/Signup.tsx"]);
    await generateBriefComparison(project.id, newFile);
    expect(calls(newFile.generate)).toBe(1);

    await prisma.assignment.update({ where: { id: project.assignmentId! }, data: { description: "The app has a login page and a signup page." } });
    const newBrief = briefDeps(answer(), ["README.md", "src/Login.tsx", "src/Signup.tsx"]);
    await generateBriefComparison(project.id, newBrief);
    expect(calls(newBrief.generate)).toBe(1);
  });
});

describe("the page is told when nothing changed", () => {
  it("records the up-to-date outcome briefly, shows it to the instructor, and a new run clears it", async () => {
    process.env.AI_REVIEW_ENABLED = "true";
    const s = await setup("GITHUB");
    await prisma.aiReportReview.create({
      data: { reportId: s.report.id, kind: "MEMBER_SUMMARIES", status: "OK", promptVersion: "x", model: "m", content: { members: [], aiAddressed: [] } },
    });
    recordUpToDate(s.project.id, "2026-10-27T03:00:00.000Z");
    expect(lastUpToDate(s.project.id)).toEqual({ since: "2026-10-27T03:00:00.000Z" });

    const app = createApp();
    const res = await request(app).get(`/api/groups/${s.project.id}/ai-review`).set("Authorization", authHeaderFor(s.instructor as never));
    expect(res.body.upToDate).toEqual({ since: "2026-10-27T03:00:00.000Z" });
    const asMember = await request(app).get(`/api/groups/${s.project.id}/ai-review`).set("Authorization", authHeaderFor(s.ben as never));
    expect(asMember.body).not.toHaveProperty("upToDate");

    startReview(s.project.id, async () => {});
    await waitForReview(s.project.id);
    expect(lastUpToDate(s.project.id)).toBeNull();
  });

  it("expires after ten minutes", () => {
    recordUpToDate(987654, "2026-10-27T03:00:00.000Z", Date.now() - 11 * 60 * 1000);
    expect(lastUpToDate(987654)).toBeNull();
  });
});

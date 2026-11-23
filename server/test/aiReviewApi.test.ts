import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";
import { AI_REVIEW_PROMPT_VERSION } from "../src/lib/aiReview/prompts.js";
import { createApp } from "../src/app.js";
import { waitForReview, startReview } from "../src/lib/aiReview/reviewLock.js";
import { anonymizeUser } from "../src/lib/anonymizeUser.js";

// Gemini is never reached: the groups below are Docs-only with no document, so a review run has no
// evidence and makes no AI call.
const app = createApp();

beforeEach(() => { process.env.AI_REVIEW_ENABLED = "true"; });
afterEach(() => { delete process.env.AI_REVIEW_ENABLED; });

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id, repoUrl: null });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lia Leader" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Reyes" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
  await createClassSection(otherInstructor.id);
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  const evidence = { files: [{ path: "src/a.ts", added: 3, removed: 0 }], docSections: ["Intro"], commitCount: 1, otherCommits: 0 };
  const review = await prisma.aiReportReview.create({
    data: {
      reportId: report.id,
      kind: "MEMBER_SUMMARIES",
      status: "PARTIAL",
      promptVersion: AI_REVIEW_PROMPT_VERSION,
      model: "m",
      errorCode: "AI_UNAVAILABLE",
      content: {
        members: [
          { userId: leader.id, summary: "Wrote the Intro.", source: "ai", evidence },
          { userId: ben.id, summary: "Added the login page.", source: "ai", evidence },
        ],
        aiAddressed: [{ userId: ben.id, where: "docs", count: 1 }],
      },
    },
  });
  return { instructor, cls, project, leader, ben, outsider, otherInstructor, report, review };
}

const get = (id: number, u: { id: number; email: string; name: string; systemRole: never }) =>
  request(app).get(`/api/groups/${id}/ai-review`).set("Authorization", authHeaderFor(u));

describe("GET /api/groups/:id/ai-review visibility", () => {
  it("a member sees only their own summary and no instructor-only fields", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.ben as never);
    expect(res.status).toBe(200);
    expect(res.body.summaries).toHaveLength(1);
    expect(res.body.summaries[0]).toMatchObject({ userId: s.ben.id, summary: "Added the login page.", isYou: true });
    expect(res.body).not.toHaveProperty("aiAddressed");
    expect(res.body).not.toHaveProperty("errorCode");
    expect(res.body).not.toHaveProperty("status");
    expect(res.body.canGenerate).toBe(false);
  });

  it("the leader sees every member's summary with paths and headings only, but not the instructor-only notes", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.leader as never);
    expect(res.status).toBe(200);
    expect(res.body.summaries.map((m: { name: string }) => m.name).sort()).toEqual(["Ben Reyes", "Lia Leader"]);
    expect(JSON.stringify(res.body)).not.toMatch(/excerpt|docsText/);
    expect(res.body).not.toHaveProperty("aiAddressed");
    expect(res.body).not.toHaveProperty("errorCode");
  });

  it("the owning instructor sees everything including status, error code and AI-addressed notes", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.instructor as never);
    expect(res.status).toBe(200);
    expect(res.body.summaries).toHaveLength(2);
    expect(res.body).toMatchObject({ status: "PARTIAL", errorCode: "AI_UNAVAILABLE", canGenerate: true, outdated: false });
    expect(res.body.aiAddressed).toEqual([{ userId: s.ben.id, where: "docs", count: 1, name: "Ben Reyes" }]);
  });

  it("outsiders and other instructors get 403", async () => {
    const s = await setup();
    expect((await get(s.project.id, s.outsider as never)).status).toBe(403);
    expect((await get(s.project.id, s.otherInstructor as never)).status).toBe(403);
  });

  it("a newer report makes the review outdated", async () => {
    const s = await setup();
    await prisma.report.create({ data: { projectId: s.project.id, content: "{}", generatedAt: new Date(Date.now() + 60_000) } });
    const res = await get(s.project.id, s.ben as never);
    expect(res.body.outdated).toBe(true);
  });

  it("is hidden for everyone when the server switch or the class switch is off", async () => {
    const s = await setup();
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: false } });
    expect((await get(s.project.id, s.ben as never)).body).toEqual({ enabled: false });
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: true } });
    delete process.env.AI_REVIEW_ENABLED;
    expect((await get(s.project.id, s.instructor as never)).body).toEqual({ enabled: false });
  });

  it("returns summaries: null before any review exists", async () => {
    const s = await setup();
    await prisma.aiReportReview.delete({ where: { id: s.review.id } });
    const res = await get(s.project.id, s.leader as never);
    expect(res.body).toMatchObject({ enabled: true, summaries: null, generatedAt: null, hasReport: true });
  });
});

describe("POST /api/groups/:id/ai-review", () => {
  const post = (id: number, u: never) => request(app).post(`/api/groups/${id}/ai-review`).set("Authorization", authHeaderFor(u));

  it("only the owning instructor may start it", async () => {
    const s = await setup();
    expect((await post(s.project.id, s.leader as never)).status).toBe(403);
    expect((await post(s.project.id, s.otherInstructor as never)).status).toBe(403);
  });

  it("answers 409 with a code when the switch is off or there is no report", async () => {
    const s = await setup();
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: false } });
    expect((await post(s.project.id, s.instructor as never)).body.code).toBe("AI_REVIEW_OFF_FOR_CLASS");
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: true } });
    delete process.env.AI_REVIEW_ENABLED;
    expect((await post(s.project.id, s.instructor as never)).body.code).toBe("AI_REVIEW_DISABLED");
    process.env.AI_REVIEW_ENABLED = "true";
    await prisma.report.deleteMany({ where: { projectId: s.project.id } });
    expect((await post(s.project.id, s.instructor as never)).body.code).toBe("NO_REPORT");
  });

  it("starts a background run and never touches Report.content", async () => {
    const s = await setup();
    expect((await post(s.project.id, s.instructor as never)).status).toBe(202);
    await waitForReview(s.project.id);
    expect((await prisma.report.findUnique({ where: { id: s.report.id } }))!.content).toBe("{}");
    const row = await prisma.aiReportReview.findUnique({ where: { reportId_kind: { reportId: s.report.id, kind: "MEMBER_SUMMARIES" } } });
    expect(row!.status).toBe("SKIPPED");
  });

  it("refuses a second run while one is in progress", async () => {
    const s = await setup();
    let release!: () => void;
    startReview(s.project.id, () => new Promise<void>((r) => { release = r; }));
    const res = await post(s.project.id, s.instructor as never);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("REVIEW_IN_PROGRESS");
    expect((await get(s.project.id, s.leader as never)).body.running).toBe(true);
    release();
    await waitForReview(s.project.id);
  });
});

describe("privacy: export and erasure", () => {
  it("export holds only the caller's own summary", async () => {
    const s = await setup();
    const res = await request(app).get("/api/privacy/export").set("Authorization", authHeaderFor(s.ben as never));
    expect(res.status).toBe(200);
    const body = JSON.parse(res.text);
    expect(body.aiWorkSummaries).toEqual([expect.objectContaining({ projectId: s.project.id, summary: "Added the login page." })]);
    expect(res.text).not.toContain("Wrote the Intro.");
  });

  it("erasure removes the user's entry and login from AI review data and leaves the others and the scores alone", async () => {
    const s = await setup();
    await prisma.user.update({ where: { id: s.ben.id }, data: { githubUsername: "benreyes" } });
    await prisma.aiCommitDigest.create({
      data: { projectId: s.project.id, sha: "abc", promptVersion: AI_REVIEW_PROMPT_VERSION, model: "m", authorLogin: "benreyes", summary: "Added x.", files: [] },
    });
    const result = await anonymizeUser(s.ben.id, { actorId: s.instructor.id, actorName: "Admin", action: "USER_DELETED" });
    expect(result).toBeTruthy();
    const row = await prisma.aiReportReview.findUnique({ where: { id: s.review.id } });
    const content = row!.content as { members: Array<{ userId: number }>; aiAddressed: unknown[] };
    expect(content.members.map((m) => m.userId)).toEqual([s.leader.id]);
    expect(content.aiAddressed).toEqual([]);
    expect((await prisma.aiCommitDigest.findFirst({ where: { sha: "abc" } }))!.authorLogin).toBeNull();
    expect((await prisma.report.findUnique({ where: { id: s.report.id } }))!.content).toBe("{}");
  });
});

void vi;

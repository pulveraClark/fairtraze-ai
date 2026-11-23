import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";
import { AI_REVIEW_PROMPT_VERSION, BRIEF_PROMPT_VERSION } from "../src/lib/aiReview/prompts.js";
import { briefFingerprint } from "../src/lib/aiReview/briefEvidence.js";
import { requirementKeys } from "../src/lib/requirementMarks.js";
import { createApp } from "../src/app.js";

// What a plain member and the group leader receive from GET /api/groups/:id/ai-review, field by field.
// Gemini is never reached: every row is stored by the test.

const app = createApp();
beforeEach(() => { process.env.AI_REVIEW_ENABLED = "true"; });
afterEach(() => { delete process.env.AI_REVIEW_ENABLED; });

const BRIEF = "The app has a login page. The app has a survey. The app exports a report. The app sends reminders.";
const REQS = [
  { text: "Has a login page", status: "FOUND", evidence: [{ type: "doc", ref: "Intro", quote: "OTHER MEMBER WORDS", authors: [0] }], sourceQuote: "The app has a login page." },
  { text: "Has a survey", status: "PARTLY_FOUND", evidence: [], sourceQuote: "The app has a survey." },
  { text: "Exports a report", status: "NOT_FOUND", evidence: [], sourceQuote: "The app exports a report." },
  { text: "Sends reminders", status: "FOUND", unverified: true, evidence: [], sourceQuote: "The app sends reminders." },
];

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: BRIEF } });
  const project = await createProject({ assignmentId: asg.id, repoUrl: null });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lia Leader" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Reyes" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  const evidence = { files: [{ path: "src/a.ts", added: 3, removed: 0, commits: ["abc"] }], docSections: ["Intro"], commitCount: 1, otherCommits: 0 };
  await prisma.aiReportReview.create({
    data: {
      reportId: report.id, kind: "MEMBER_SUMMARIES", status: "OK", promptVersion: AI_REVIEW_PROMPT_VERSION, model: "secret-model",
      content: {
        members: [
          { userId: leader.id, summary: "Wrote the Intro.", source: "ai", evidence },
          { userId: ben.id, summary: "Ben, with a contribution share of 41.2%, was a free-rider on the login page. He added the login page. The Gini coefficient is 0.31.", source: "ai", evidence },
        ],
        aiAddressed: [{ userId: ben.id, where: "docs", count: 1 }],
      },
    },
  });
  await prisma.aiReportReview.create({
    data: {
      reportId: report.id, kind: "BRIEF_COMPARISON", status: "OK", promptVersion: BRIEF_PROMPT_VERSION, model: "secret-model",
      briefHash: briefFingerprint(BRIEF, []),
      content: { requirements: REQS, aiAddressedCount: 2, sources: { writtenBrief: true, filesRead: 0, skipped: [{ name: "secret.pdf", reason: "x" }], droppedCount: 3 } },
    },
  });
  return { instructor, project, asg, cls, leader, ben, report };
}

const get = (id: number, u: unknown) => request(app).get(`/api/groups/${id}/ai-review`).set("Authorization", authHeaderFor(u as never));

const FORBIDDEN_KEYS = ["status", "unverified", "errorCode", "retryAt", "aiLimit", "upToDate", "aiAddressed", "aiAddressedCount", "briefFailed",
  "hasInstructions", "sources", "droppedCount", "promptVersion", "model", "commits"];
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
}
const FORBIDDEN_WORDS = /free[\s-]?rider|gini|\bband\b|team health|needs your check|unverified|moderate risk|high risk|%|!/i;

describe("student view of the AI review", () => {
  it("a plain member: own summary only, states instead of raw status, no author or instructor-only fields", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.ben);
    expect(res.status).toBe(200);
    expect(res.body.summaries.map((x: { userId: number }) => x.userId)).toEqual([s.ben.id]);
    expect(Object.keys(res.body.summaries[0]).sort()).toEqual(["evidence", "githubUsername", "isYou", "name", "source", "summary", "userId"]);
    expect(res.body.summaries[0].githubUsername).toBeNull();
    expect(res.body.canGenerate).toBe(false);
    expect(res.body.briefCheck.requirements.map((r: { state: string }) => r.state)).toEqual(["COVERED", "PARTLY", "NOT_FOUND", "NOT_CONFIRMED"]);
    for (const r of res.body.briefCheck.requirements) {
      expect(r.key).toBeUndefined();
      expect(r.contributors).toBeUndefined();
    }
    const keys = keysDeep(res.body);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN_WORDS);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });

  it("the leader: every summary, keys for 'We have this', still no instructor-only fields", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.leader);
    expect(res.body.summaries.map((x: { userId: number }) => x.userId).sort()).toEqual([s.leader.id, s.ben.id].sort());
    for (const r of res.body.briefCheck.requirements) expect(r.key).toMatch(/^[0-9a-f]+$/);
    const keys = keysDeep(res.body);
    for (const k of FORBIDDEN_KEYS) expect(keys.has(k), k).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(FORBIDDEN_WORDS);
  });

  it("a summary's text loses the percentage, the free-rider word and the Gini sentence", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.leader);
    const ben = res.body.summaries.find((x: { userId: number }) => x.userId === s.ben.id);
    expect(ben.summary).toBe("Ben had low contribution on the login page. He added the login page.");
  });

  it("Docs words written by someone else are hidden from a member as well as from the leader", async () => {
    const s = await setup();
    for (const who of [s.ben, s.leader]) {
      const res = await get(s.project.id, who);
      expect(res.body.briefCheck.requirements[0].evidence[0]).toMatchObject({ type: "doc", ref: "Intro", quote: "", quoteHidden: true });
    }
  });

  it("an instructor-confirmed mark reads CONFIRMED; a leader's claim and a stale mark do not", async () => {
    const s = await setup();
    const keys = requirementKeys(REQS as never) as string[];
    const mk = (key: string, role: "INSTRUCTOR" | "LEADER", status: "INSTRUCTOR_CONFIRMED" | "LEADER_CLAIM", sourceQuote: string) =>
      prisma.requirementMark.create({ data: { projectId: s.project.id, requirementKey: key, role, status, requirementText: "x", sourceQuote, markedById: role === "LEADER" ? s.leader.id : s.instructor.id } });
    await mk(keys[2]!, "INSTRUCTOR", "INSTRUCTOR_CONFIRMED", "The app exports a report.");
    await mk(keys[1]!, "LEADER", "LEADER_CLAIM", "The app has a survey.");
    await mk(keys[3]!, "INSTRUCTOR", "INSTRUCTOR_CONFIRMED", "A sentence the instructions no longer contain.");
    for (const who of [s.ben, s.leader]) {
      const res = await get(s.project.id, who);
      expect(res.body.briefCheck.requirements.map((r: { state: string }) => r.state)).toEqual(["COVERED", "PARTLY", "CONFIRMED", "NOT_CONFIRMED"]);
    }
  });

  it("the instructor still gets the full answer", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.instructor);
    expect(res.body.status).toBe("OK");
    expect(res.body.aiAddressed).toHaveLength(1);
    expect(res.body.briefCheck.requirements[3]).toMatchObject({ status: "FOUND", unverified: true });
    expect(res.body.briefCheck.aiAddressedCount).toBe(2);
  });

  it("AI off for the class, or nothing generated: students get nothing to show", async () => {
    const s = await setup();
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: false } });
    expect((await get(s.project.id, s.ben)).body).toEqual({ enabled: false });

    const empty = await setup();
    await prisma.aiReportReview.deleteMany({ where: { reportId: empty.report.id } });
    const res = await get(empty.project.id, empty.ben);
    expect(res.body.summaries).toBeNull();
    expect(res.body.briefCheck).toBeUndefined();
  });

  it("a failed-refresh note: the leader gets dates only, a plain member gets none", async () => {
    const s = await setup();
    await prisma.aiReportReview.updateMany({
      where: { reportId: s.report.id, kind: "BRIEF_COMPARISON" },
      data: { content: { requirements: REQS, aiAddressedCount: 0, lastAttempt: { at: new Date().toISOString(), errorCode: "AI_QUOTA_DAILY", retryAt: new Date().toISOString(), keptLast: true } } },
    });
    const res = await get(s.project.id, s.leader);
    expect(Object.keys(res.body.refreshFailed.brief).sort()).toEqual(["at", "shownFrom"]);
    expect(JSON.stringify(res.body)).not.toContain("AI_QUOTA_DAILY");
    expect((await get(s.project.id, s.ben)).body).not.toHaveProperty("refreshFailed");
  });
});

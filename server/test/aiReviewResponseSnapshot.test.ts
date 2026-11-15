import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";
import { AI_REVIEW_PROMPT_VERSION, BRIEF_PROMPT_VERSION } from "../src/lib/aiReview/prompts.js";
import { briefFingerprint } from "../src/lib/aiReview/briefEvidence.js";
import { requirementKeys } from "../src/lib/requirementMarks.js";
import { createApp } from "../src/app.js";

const app = createApp();

beforeEach(() => { process.env.AI_REVIEW_ENABLED = "true"; });
afterEach(() => { delete process.env.AI_REVIEW_ENABLED; });

// Characterisation (E1c-4): complete GET /api/groups/:id/ai-review bodies, recorded from the code as it was before
// the reads were reordered into parallel stages. Ids and timestamps become stable placeholders.
type Id = { id: number; email: string; name: string; systemRole: never };
const DESCRIPTION = "The system must let students log in. The system must export a report.";

function norm(body: unknown, ids: Record<string, number>): unknown {
  const byId = new Map(Object.entries(ids).map(([label, id]) => [id, label]));
  const walk = (v: unknown, key = ""): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === "number" && /(^id$|Id$|userId|authors)/i.test(key) && byId.has(v)) return `<${byId.get(v)}>`;
    if (typeof v === "string") return v.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<ts>");
    return v;
  };
  return walk(body);
}

async function setup(opts: { review: boolean; brief: boolean; mark: boolean; description: boolean }) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
  await createClassSection(otherInstructor.id);
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "COMBINED" });
  if (opts.description) await prisma.assignment.update({ where: { id: asg.id }, data: { description: DESCRIPTION } });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lia Leader" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Reyes" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  await prisma.user.update({ where: { id: ben.id }, data: { githubUsername: "benreyes" } });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  const ids: Record<string, number> = { instructor: instructor.id, leader: leader.id, ben: ben.id, project: project.id, report: report.id };
  if (opts.review) {
    const evidence = { files: [{ path: "src/a.ts", added: 3, removed: 0, commits: ["a".repeat(40)] }], docSections: ["Intro"], commitCount: 1, otherCommits: 0 };
    await prisma.aiReportReview.create({
      data: {
        reportId: report.id, kind: "MEMBER_SUMMARIES", status: "PARTIAL", promptVersion: AI_REVIEW_PROMPT_VERSION, model: "m", errorCode: "AI_UNAVAILABLE",
        content: {
          members: [
            { userId: leader.id, summary: "Wrote the Intro.", source: "ai", evidence },
            { userId: ben.id, summary: "Added the login page.", source: "ai", evidence },
          ],
          aiAddressed: [{ userId: ben.id, where: "docs", count: 1 }],
        },
      },
    });
  }
  if (opts.brief) {
    const requirements = [
      {
        text: "Students can log in", status: "FOUND", sourceQuote: "The system must let students log in.",
        evidence: [
          { type: "file", ref: "src/login.ts", quote: "export function login()", quoteSafe: true, commits: ["a".repeat(40)], headSha: "b".repeat(40), lines: [1, 2] },
          { type: "doc", ref: "Intro", quote: "Students log in with email.", authors: [ben.id] },
        ],
      },
      { text: "Report can be exported", status: "NOT_FOUND", sourceQuote: "The system must export a report.", evidence: [] },
    ];
    await prisma.aiReportReview.create({
      data: {
        reportId: report.id, kind: "BRIEF_COMPARISON", status: "OK", promptVersion: BRIEF_PROMPT_VERSION, model: "m",
        briefHash: briefFingerprint(opts.description ? DESCRIPTION : "", []),
        content: { requirements, sources: { writtenBrief: true, filesRead: 0, skipped: [], droppedCount: 2 }, aiAddressedCount: 1 },
      },
    });
    if (opts.mark && opts.description) {
      const keys = requirementKeys(requirements as never);
      await prisma.requirementMark.create({
        data: {
          projectId: project.id, requirementKey: keys[1]!, requirementText: requirements[1]!.text, sourceQuote: requirements[1]!.sourceQuote,
          role: "INSTRUCTOR", status: "INSTRUCTOR_CONFIRMED", markedById: instructor.id,
        },
      });
    }
  }
  return { instructor, otherInstructor, leader, ben, outsider, cls, asg, project, report, ids };
}

type Setup = Awaited<ReturnType<typeof setup>>;
async function bodies(s: Setup, who: Array<[string, Id]>) {
  const out: Record<string, unknown> = {};
  for (const [label, u] of who) {
    const r = await request(app).get(`/api/groups/${s.project.id}/ai-review`).set("Authorization", authHeaderFor(u));
    out[label] = { status: r.status, body: norm(r.body, s.ids) };
  }
  return out;
}
const three = (s: Setup): Array<[string, Id]> => [
  ["instructor", s.instructor as unknown as Id], ["leader", s.leader as unknown as Id], ["member", s.ben as unknown as Id],
];

describe("ai-review GET: full bodies stay identical (characterisation)", () => {
  it("with findings and brief check (and a confirmed mark)", async () => {
    const s = await setup({ review: true, brief: true, mark: true, description: true });
    expect(await bodies(s, three(s))).toMatchSnapshot();
  });

  it("brief check only (no findings yet)", async () => {
    const s = await setup({ review: false, brief: true, mark: false, description: true });
    expect(await bodies(s, three(s))).toMatchSnapshot();
  });

  it("findings only, no instructions", async () => {
    const s = await setup({ review: true, brief: false, mark: false, description: false });
    expect(await bodies(s, three(s))).toMatchSnapshot();
  });

  it("nothing at all", async () => {
    const s = await setup({ review: false, brief: false, mark: false, description: false });
    expect(await bodies(s, three(s))).toMatchSnapshot();
  });

  it("brief outdated (instructions changed after the check)", async () => {
    const s = await setup({ review: true, brief: true, mark: true, description: true });
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: DESCRIPTION + " It must be fast." } });
    expect(await bodies(s, three(s))).toMatchSnapshot();
  });

  it("class switch off: only { enabled: false }, even with stored findings; non-members still 403 first", async () => {
    const s = await setup({ review: true, brief: true, mark: true, description: true });
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: false } });
    const out = await bodies(s, [...three(s), ["outsider", s.outsider as unknown as Id], ["otherInstructor", s.otherInstructor as unknown as Id]]);
    expect(out).toMatchSnapshot();
    for (const k of ["instructor", "leader", "member"]) expect((out[k] as { body: unknown }).body).toEqual({ enabled: false });
  });

  it("server switch off: only { enabled: false }; non-members still 403 first", async () => {
    const s = await setup({ review: true, brief: true, mark: true, description: true });
    delete process.env.AI_REVIEW_ENABLED;
    const out = await bodies(s, [...three(s), ["outsider", s.outsider as unknown as Id]]);
    expect(out).toMatchSnapshot();
    expect((out.leader as { body: unknown }).body).toEqual({ enabled: false });
  });

  it("errors: 400, 401, 403, 404 carry nothing but their message", async () => {
    const s = await setup({ review: true, brief: true, mark: true, description: true });
    const out: Record<string, unknown> = {};
    const bad = await request(app).get(`/api/groups/abc/ai-review`).set("Authorization", authHeaderFor(s.leader as unknown as Id));
    out.badId = { status: bad.status, body: bad.body };
    const anon = await request(app).get(`/api/groups/${s.project.id}/ai-review`);
    out.anon = { status: anon.status, body: anon.body };
    const missing = await request(app).get(`/api/groups/2147483000/ai-review`).set("Authorization", authHeaderFor(s.leader as unknown as Id));
    out.missing = { status: missing.status, body: missing.body };
    for (const [label, u] of [["outsider", s.outsider], ["otherInstructor", s.otherInstructor]] as const) {
      const r = await request(app).get(`/api/groups/${s.project.id}/ai-review`).set("Authorization", authHeaderFor(u as unknown as Id));
      out[label] = { status: r.status, body: r.body };
      // Nothing from the stored review, brief or marks may be in a refused answer.
      expect(r.body).toEqual({ error: "You do not have access to this group." });
    }
    expect(out).toMatchSnapshot();
  });
});

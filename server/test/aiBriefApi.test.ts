import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { briefHash } from "../src/lib/aiReview/briefEvidence.js";

const app = createApp();
beforeEach(() => { process.env.AI_REVIEW_ENABLED = "true"; });
afterEach(() => { delete process.env.AI_REVIEW_ENABLED; });

const BRIEF = "The app has a login page.";

async function setup(opts: { status?: "OK" | "FAILED" | "SKIPPED"; requirements?: unknown[]; brief?: string } = {}) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: other } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "COMBINED" });
  const brief = opts.brief ?? BRIEF;
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: brief } });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lia Leader" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Reyes" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  const requirements = opts.requirements ?? [
    { text: "Has a login page", status: "FOUND", evidence: [
      { type: "file", ref: "src/Login.tsx", quote: "export function Login()" },
      { type: "doc", ref: "Methodology", quote: "Ben wrote this sentence", authors: [ben.id] },
      { type: "doc", ref: "Intro", quote: "Lia wrote this sentence", authors: [leader.id] },
    ] },
    { text: "Has a survey", status: "NOT_FOUND", evidence: [] },
  ];
  await prisma.aiReportReview.create({
    data: {
      reportId: report.id, kind: "BRIEF_COMPARISON", status: opts.status ?? "OK", promptVersion: "brief-1", model: "m",
      briefHash: briefHash(BRIEF), errorCode: opts.status === "FAILED" ? "AI_UNAVAILABLE" : null,
      content: { requirements, aiAddressedCount: 2 },
    },
  });
  return { instructor, other, cls, asg, project, leader, ben, report };
}

const get = (id: number, u: unknown) => request(app).get(`/api/groups/${id}/ai-review`).set("Authorization", authHeaderFor(u as never));

describe("brief check visibility", () => {
  it("the instructor sees every quote and the AI-addressed count", async () => {
    const s = await setup();
    const b = (await get(s.project.id, s.instructor)).body.briefCheck;
    expect(b.requirements).toHaveLength(2);
    expect(b.requirements[0].evidence.map((e: { quote: string }) => e.quote)).toEqual(["export function Login()", "Ben wrote this sentence", "Lia wrote this sentence"]);
    expect(b.aiAddressedCount).toBe(2);
    expect(b.nothingFound).toBe(false);
    expect(b.outdated).toBe(false);
  });

  it("the leader sees the same requirements and code quotes; other members' Docs words are headings only; no AI-addressed count", async () => {
    const s = await setup();
    const res = await get(s.project.id, s.leader);
    const ev = res.body.briefCheck.requirements[0].evidence;
    expect(ev[0]).toMatchObject({ ref: "src/Login.tsx", quote: "export function Login()", quoteHidden: false });
    expect(ev[1]).toMatchObject({ ref: "Methodology", quote: "", quoteHidden: true });
    expect(ev[2]).toMatchObject({ ref: "Intro", quote: "Lia wrote this sentence", quoteHidden: false });
    expect(res.body.briefCheck).not.toHaveProperty("aiAddressedCount");
    expect(JSON.stringify(res.body)).not.toContain("Ben wrote this sentence");
    expect(JSON.stringify(res.body)).not.toContain("authors");
  });

  it("an ordinary member and outsiders never get it", async () => {
    const s = await setup();
    const member = await get(s.project.id, s.ben);
    expect(member.status).toBe(200);
    expect(member.body).not.toHaveProperty("briefCheck");
    expect(member.body).not.toHaveProperty("briefFailed");
    expect(JSON.stringify(member.body)).not.toMatch(/Has a login page|src\/Login/);
    expect((await get(s.project.id, s.other)).status).toBe(403);
  });

  it("hidden when the brief is empty or the run failed or was skipped; the instructor is told only about a failure", async () => {
    const empty = await setup({ brief: "  " });
    expect((await get(empty.project.id, empty.instructor)).body).not.toHaveProperty("briefCheck");

    const failed = await setup({ status: "FAILED", requirements: [] });
    const asInstructor = (await get(failed.project.id, failed.instructor)).body;
    expect(asInstructor).not.toHaveProperty("briefCheck");
    expect(asInstructor.briefFailed).toBe(true);
    const asLeader = (await get(failed.project.id, failed.leader)).body;
    expect(asLeader).not.toHaveProperty("briefCheck");
    expect(asLeader).not.toHaveProperty("briefFailed");

    const skipped = await setup({ status: "SKIPPED", requirements: [] });
    expect((await get(skipped.project.id, skipped.instructor)).body).not.toHaveProperty("briefCheck");
  });

  it("when nothing was found it is still shown, flagged nothingFound (the page shows one calm line)", async () => {
    const s = await setup({ requirements: [{ text: "Has a login page", status: "NOT_FOUND", evidence: [] }] });
    const b = (await get(s.project.id, s.leader)).body.briefCheck;
    expect(b.nothingFound).toBe(true);
    expect(b.requirements).toHaveLength(1);
  });

  it("zero requirements is hidden; a changed brief or a newer report marks it outdated", async () => {
    const none = await setup({ requirements: [] });
    expect((await get(none.project.id, none.instructor)).body).not.toHaveProperty("briefCheck");

    const s = await setup();
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: "A different brief." } });
    expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(true);
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: BRIEF } });
    expect((await get(s.project.id, s.instructor)).body.briefCheck.outdated).toBe(false);
    await prisma.report.create({ data: { projectId: s.project.id, content: "{}", generatedAt: new Date(Date.now() + 60_000) } });
    expect((await get(s.project.id, s.leader)).body.briefCheck.outdated).toBe(true);
  });

  it("is hidden along with everything else when the class switch is off", async () => {
    const s = await setup();
    await prisma.classSection.update({ where: { id: s.cls.id }, data: { aiReviewEnabled: false } });
    expect((await get(s.project.id, s.leader)).body).toEqual({ enabled: false });
  });
});

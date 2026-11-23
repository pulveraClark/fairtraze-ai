import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { requirementKeys } from "../src/lib/requirementMarks.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

// "From the project instructions" in the New task title: leader only, text only, hides items that already
// have a task. Planning data only; no AI call is made.

const app = createApp();

const REQS = [
  { text: "Has a login page", status: "FOUND", evidence: [{ type: "doc", ref: "Intro", quote: "SECRET QUOTE", authors: [1] }], sourceQuote: "The app has a login page." },
  { text: "Has a survey", status: "NOT_FOUND", evidence: [], sourceQuote: "Include a survey." },
  { text: "No source item", status: "NOT_FOUND", evidence: [] }, // no source -> no stable key -> never suggested
];

async function setup(reviewStatus: "OK" | "FAILED" = "OK", requirements: unknown[] = REQS) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "COMBINED" });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: ben } = await createUser({ systemRole: "STUDENT" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id);
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  await prisma.aiReportReview.create({
    data: { reportId: report.id, kind: "BRIEF_COMPARISON", status: reviewStatus, promptVersion: "brief-3", model: "m", content: { requirements, aiAddressedCount: 0 } },
  });
  return { instructor, project, leader, ben, report };
}

const board = (id: number, u: unknown) => request(app).get(`/api/groups/${id}/tasks`).set("Authorization", authHeaderFor(u as never));
const create = (id: number, u: unknown, body: object) =>
  request(app).post(`/api/groups/${id}/tasks`).set("Authorization", authHeaderFor(u as never)).send(body);

describe("task title suggestions", () => {
  it("the leader gets text-only suggestions; members and the instructor get none", async () => {
    const s = await setup();
    const res = await board(s.project.id, s.leader);
    const keys = requirementKeys(REQS as never);
    expect(res.body.suggestions).toEqual([{ key: keys[0], text: "Has a login page" }, { key: keys[1], text: "Has a survey" }]);
    expect(JSON.stringify(res.body)).not.toContain("SECRET QUOTE");
    expect((await board(s.project.id, s.ben)).body.suggestions).toBeUndefined();
    expect((await board(s.project.id, s.instructor)).body.suggestions).toBeUndefined();
  });

  it("is absent when there is no usable check", async () => {
    const failed = await setup("FAILED");
    expect((await board(failed.project.id, failed.leader)).body.suggestions).toBeUndefined();
    const empty = await setup("OK", []);
    expect((await board(empty.project.id, empty.leader)).body.suggestions).toBeUndefined();
  });

  it("hides an item once a task was created from it, and shows it again when that task is deleted", async () => {
    const s = await setup();
    const [k0, k1] = requirementKeys(REQS as never) as string[];
    const made = await create(s.project.id, s.leader, { title: "Has a login page", requirementKey: k0 });
    expect(made.status).toBe(201);
    expect((await board(s.project.id, s.leader)).body.suggestions.map((x: { key: string }) => x.key)).toEqual([k1]);
    await request(app).delete(`/api/groups/${s.project.id}/tasks/${made.body.id}`).set("Authorization", authHeaderFor(s.leader as never));
    expect((await board(s.project.id, s.leader)).body.suggestions).toHaveLength(2);
  });

  it("stores the key only for the leader and only for a real item of the latest check", async () => {
    const s = await setup();
    const [k0] = requirementKeys(REQS as never) as string[];
    const bogus = await create(s.project.id, s.leader, { title: "Other", requirementKey: "f".repeat(32) });
    expect(bogus.status).toBe(201);
    const member = await create(s.project.id, s.ben, { title: "By a member", requirementKey: k0 });
    expect(member.status).toBe(201);
    const rows = await prisma.task.findMany({ where: { projectId: s.project.id } });
    expect(rows.map((t) => t.requirementKey)).toEqual([null, null]);
    expect((await board(s.project.id, s.leader)).body.suggestions).toHaveLength(2);
  });

  it("an unchanged board is still a 304 on the next poll", async () => {
    const s = await setup();
    const first = await board(s.project.id, s.leader);
    const again = await board(s.project.id, s.leader).set("If-None-Match", first.headers.etag);
    expect(again.status).toBe(304);
  });

  it("a requirement that is reworded by a regenerated check reads as a new item; the old task keeps its key", async () => {
    const s = await setup();
    const [k0] = requirementKeys(REQS as never) as string[];
    await create(s.project.id, s.leader, { title: "Has a login page", requirementKey: k0 });
    // Regenerate: same sentence of the instructions (same key) reworded -> still counts as used.
    const same = [{ ...REQS[0], text: "The app has a login page" }, REQS[1]];
    const r2 = await prisma.report.create({ data: { projectId: s.project.id, content: "{}" } });
    await prisma.aiReportReview.create({ data: { reportId: r2.id, kind: "BRIEF_COMPARISON", status: "OK", promptVersion: "brief-3", model: "m", content: { requirements: same, aiAddressedCount: 0 } } });
    expect((await board(s.project.id, s.leader)).body.suggestions.map((x: { text: string }) => x.text)).toEqual(["Has a survey"]);
    // Regenerate again with a different source sentence -> new key -> offered again.
    const moved = [{ ...REQS[0], sourceQuote: "Users must be able to sign in." }, REQS[1]];
    const r3 = await prisma.report.create({ data: { projectId: s.project.id, content: "{}" } });
    await prisma.aiReportReview.create({ data: { reportId: r3.id, kind: "BRIEF_COMPARISON", status: "OK", promptVersion: "brief-3", model: "m", content: { requirements: moved, aiAddressedCount: 0 } } });
    expect((await board(s.project.id, s.leader)).body.suggestions).toHaveLength(2);
    expect((await prisma.task.findFirstOrThrow({ where: { projectId: s.project.id } })).requirementKey).toBe(k0);
  });
});

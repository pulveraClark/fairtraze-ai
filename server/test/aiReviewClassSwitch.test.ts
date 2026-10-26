import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { waitForReview } from "../src/lib/aiReview/reviewLock.js";

const app = createApp();

beforeEach(() => { process.env.AI_REVIEW_ENABLED = "true"; });
afterEach(() => { delete process.env.AI_REVIEW_ENABLED; });

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: other } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id, repoUrl: null });
  await createMembership(student.id, project.id, "LEADER");
  const report = await prisma.report.create({ data: { projectId: project.id, content: "{}" } });
  await prisma.aiReportReview.create({
    data: { reportId: report.id, kind: "MEMBER_SUMMARIES", status: "OK", promptVersion: "ai-review-1", model: "m", content: { members: [{ userId: student.id, summary: "Wrote the Intro.", source: "ai", evidence: { files: [], docSections: [], commitCount: 0, otherCommits: 0 } }], aiAddressed: [] } },
  });
  return { instructor, other, admin, student, cls, project, report };
}

const patch = (id: number, u: never, body: unknown) =>
  request(app).patch(`/api/classes/${id}/ai-review`).set("Authorization", authHeaderFor(u)).send(body as object);

describe("PATCH /api/classes/:id/ai-review", () => {
  it("is on by default and only the owning instructor can change it", async () => {
    const s = await setup();
    expect(s.cls.aiReviewEnabled).toBe(true);
    expect((await patch(s.cls.id, s.other as never, { enabled: false })).status).toBe(403);
    expect((await patch(s.cls.id, s.student as never, { enabled: false })).status).toBe(403);
    expect((await patch(s.cls.id, s.admin as never, { enabled: false })).status).toBe(403);
    expect((await prisma.classSection.findUnique({ where: { id: s.cls.id } }))!.aiReviewEnabled).toBe(true);
  });

  it("rejects a body that is not a boolean", async () => {
    const s = await setup();
    expect((await patch(s.cls.id, s.instructor as never, { enabled: "no" })).status).toBe(400);
    expect((await patch(s.cls.id, s.instructor as never, {})).status).toBe(400);
  });

  it("off: summaries are hidden from the member and the instructor, Generate refuses and makes no AI call; on again restores them", async () => {
    const s = await setup();
    const asStudent = () => request(app).get(`/api/groups/${s.project.id}/ai-review`).set("Authorization", authHeaderFor(s.student as never));

    expect((await asStudent()).body.summaries).toHaveLength(1);
    const off = await patch(s.cls.id, s.instructor as never, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body).toEqual({ id: s.cls.id, aiReviewEnabled: false });

    expect((await asStudent()).body).toEqual({ enabled: false });
    const get = await request(app).get(`/api/groups/${s.project.id}/ai-review`).set("Authorization", authHeaderFor(s.instructor as never));
    expect(get.body).toEqual({ enabled: false });
    const post = await request(app).post(`/api/groups/${s.project.id}/ai-review`).set("Authorization", authHeaderFor(s.instructor as never));
    expect(post.status).toBe(409);
    expect(post.body.code).toBe("AI_REVIEW_OFF_FOR_CLASS");
    await waitForReview(s.project.id);

    await patch(s.cls.id, s.instructor as never, { enabled: true });
    // The stored review was kept while off, and is served again.
    expect((await asStudent()).body.summaries).toHaveLength(1);
  });

  it("the class list the page reads carries the setting", async () => {
    const s = await setup();
    await patch(s.cls.id, s.instructor as never, { enabled: false });
    const res = await request(app).get(`/api/classes/${s.cls.id}/assignments`).set("Authorization", authHeaderFor(s.instructor as never));
    expect(res.body.class.aiReviewEnabled).toBe(false);
  });
});

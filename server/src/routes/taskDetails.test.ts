import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { BoardResponse, BoardTask, TaskDetails } from "@shared/taskTypes.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "../../test/factories.js";
import { prisma } from "../lib/prisma.js";

// The 30/min limiters have their own test (test/taskRateLimit.test.ts); ids restart on every
// truncate, so the real per-user counters would accumulate across this file's tests.
vi.mock("../middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../middleware/security.js")>("../middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, taskWriteLimiter: passthrough, taskCommentLimiter: passthrough };
});

const { createApp } = await import("../app.js");
const app = createApp();

type U = Awaited<ReturnType<typeof createUser>>["user"];

async function setupGroup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id);
  const project = await createProject({ assignmentId: assignment.id, groupName: "Team Rocket" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Leader Lee" });
  const { user: member } = await createUser({ systemRole: "STUDENT", name: "Member Mo" });
  const { user: member2 } = await createUser({ systemRole: "STUDENT", name: "Member Ben" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  await createMembership(member2.id, project.id, "MEMBER");
  return { instructor, leader, member, member2, outsider, admin, project };
}

const as = (u: U) => authHeaderFor(u);
const base = (projectId: number) => `/api/groups/${projectId}/tasks`;
const tbase = (projectId: number, taskId: number) => `${base(projectId)}/${taskId}`;

async function createTask(u: U, projectId: number, body: Record<string, unknown> = { title: "A task" }): Promise<BoardTask> {
  const res = await request(app).post(base(projectId)).set("Authorization", as(u)).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as BoardTask;
}

async function details(u: U, projectId: number, taskId: number): Promise<TaskDetails> {
  const res = await request(app).get(`${tbase(projectId, taskId)}/details`).set("Authorization", as(u));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as TaskDetails;
}

const JPEG = (n = 100) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50, 2)]);
const PDF = (n = 100) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(n, 0x20)]);

const upload = (u: U, projectId: number, taskId: number, body: Buffer, type: string, filename = "file") =>
  request(app).post(`${tbase(projectId, taskId)}/attachments`).query({ filename })
    .set("Authorization", as(u)).set("Content-Type", type).send(body);

const comment = (u: U, projectId: number, taskId: number, body: string) =>
  request(app).post(`${tbase(projectId, taskId)}/comments`).set("Authorization", as(u)).send({ body });

describe("details access", () => {
  it("lets members, the owning instructor and an admin read; rejects outsiders; instructor/admin are view-only", async () => {
    const { leader, member, instructor, admin, outsider, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    for (const u of [leader, member, instructor, admin]) {
      expect((await details(u, project.id, task.id)).taskId).toBe(task.id);
    }
    expect((await request(app).get(`${tbase(project.id, task.id)}/details`).set("Authorization", as(outsider))).status).toBe(403);
    expect((await request(app).get(`${tbase(project.id, task.id)}/details`)).status).toBe(401);

    for (const u of [instructor, admin]) {
      expect((await comment(u, project.id, task.id, "hi")).status).toBe(403);
      expect((await request(app).put(`${tbase(project.id, task.id)}/watch`).set("Authorization", as(u))).status).toBe(403);
      expect((await request(app).post(`${tbase(project.id, task.id)}/subtasks`).set("Authorization", as(u)).send({ title: "x" })).status).toBe(403);
    }
  });

  it("404s a task from another group", async () => {
    const a = await setupGroup();
    const b = await setupGroup();
    const task = await createTask(b.leader, b.project.id);
    expect((await request(app).get(`${tbase(a.project.id, task.id)}/details`).set("Authorization", as(a.leader))).status).toBe(404);
  });

  it("mirrors comment/watch permissions per task", async () => {
    const { leader, instructor, project } = await setupGroup();
    await createTask(leader, project.id);
    const asLeader = (await request(app).get(base(project.id)).set("Authorization", as(leader))).body as BoardResponse;
    expect(asLeader.tasks[0]!.permissions).toMatchObject({ comment: true, watch: true });
    const asInstructor = (await request(app).get(base(project.id)).set("Authorization", as(instructor))).body as BoardResponse;
    expect(asInstructor.tasks[0]!.permissions).toMatchObject({ comment: false, watch: false });
  });
});

describe("subtasks", () => {
  it("adds, ticks, renames, reorders and deletes; progress shows on the board; History records it", async () => {
    const { leader, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    const url = `${tbase(project.id, task.id)}/subtasks`;
    const s1 = (await request(app).post(url).set("Authorization", as(leader)).send({ title: "One" })).body;
    const s2 = (await request(app).post(url).set("Authorization", as(leader)).send({ title: "Two" })).body;
    expect((await request(app).patch(`${url}/${s1.id}`).set("Authorization", as(leader)).send({ done: true })).body.done).toBe(true);

    let b = (await request(app).get(base(project.id)).set("Authorization", as(leader))).body as BoardResponse;
    expect(b.tasks[0]!.subtasks).toEqual({ done: 1, total: 2 });

    expect((await request(app).put(`${url}/order`).set("Authorization", as(leader)).send({ ids: [s2.id, s1.id] })).status).toBe(200);
    let d = await details(leader, project.id, task.id);
    expect(d.subtasks.map((s) => s.title)).toEqual(["Two", "One"]);
    expect((await request(app).put(`${url}/order`).set("Authorization", as(leader)).send({ ids: [s2.id] })).status).toBe(400);

    expect((await request(app).delete(`${url}/${s2.id}`).set("Authorization", as(leader))).status).toBe(200);
    b = (await request(app).get(base(project.id)).set("Authorization", as(leader))).body as BoardResponse;
    expect(b.tasks[0]!.subtasks).toEqual({ done: 1, total: 1 });
    d = await details(leader, project.id, task.id);
    expect(d.activity.map((a) => a.type)).toEqual(expect.arrayContaining(["subtask_added", "subtask_done", "subtask_removed"]));
  });

  it("caps a task at 30 subtasks", async () => {
    const { leader, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    await prisma.taskSubtask.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ taskId: task.id, title: `s${i}`, position: i })) });
    const res = await request(app).post(`${tbase(project.id, task.id)}/subtasks`).set("Authorization", as(leader)).send({ title: "31st" });
    expect(res.status).toBe(409);
  });

  it("follows the edit permission: leader and the assignee (until Done); other members cannot", async () => {
    const { leader, member, member2, project } = await setupGroup();
    const task = await createTask(leader, project.id, { title: "Mine", assignedToUserId: member.id });
    const url = `${tbase(project.id, task.id)}/subtasks`;
    expect((await request(app).post(url).set("Authorization", as(member)).send({ title: "ok" })).status).toBe(201);
    expect((await request(app).post(url).set("Authorization", as(member2)).send({ title: "no" })).status).toBe(403);
    await prisma.task.update({ where: { id: task.id }, data: { status: "DONE", done: true } });
    expect((await request(app).post(url).set("Authorization", as(member)).send({ title: "late" })).status).toBe(403);
  });
});

describe("attachments", () => {
  it("accepts a sniffed image/PDF, sanitizes the filename, serves the bytes and tracks storage", async () => {
    const { leader, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    const res = await upload(leader, project.id, task.id, JPEG(), "image/jpeg", "../../evil;name?.jpg");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.filename).not.toMatch(/[\\/;?]/);
    expect(res.body.kind).toBe("IMAGE");
    const pdf = await upload(leader, project.id, task.id, PDF(), "application/pdf", "plan.pdf");
    expect(pdf.status).toBe(201);

    const d = await details(leader, project.id, task.id);
    expect(d.attachments).toHaveLength(2);
    expect(d.storage.usedBytes).toBe(JPEG().length + PDF().length);
    expect(d.storage.limitBytes).toBe(50 * 1024 * 1024);

    const got = await request(app).get(`${tbase(project.id, task.id)}/attachments/${res.body.id}`).set("Authorization", as(leader));
    expect(got.status).toBe(200);
    expect(got.headers["x-content-type-options"]).toBe("nosniff");
    expect(got.headers["content-type"]).toMatch(/image\/jpeg/);
    const pdfGot = await request(app).get(`${tbase(project.id, task.id)}/attachments/${pdf.body.id}`).set("Authorization", as(leader));
    expect(pdfGot.headers["content-security-policy"]).toBe("sandbox");
  });

  it("sniffs the real type (a lying Content-Type is not trusted) and rejects other files", async () => {
    const { leader, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    expect((await upload(leader, project.id, task.id, Buffer.from("GIF89a....."), "image/png")).status).toBe(400);
    const liar = await upload(leader, project.id, task.id, PNG, "image/jpeg");
    expect(liar.status).toBe(201);
    expect(liar.body.mime).toBe("image/png");
  });

  it("enforces 1 MB per image, 5 MB per PDF, 5 per task and 50 MB per group", async () => {
    const { leader, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    expect((await upload(leader, project.id, task.id, JPEG(1024 * 1024), "image/jpeg")).status).toBe(413);
    expect((await upload(leader, project.id, task.id, PDF(5 * 1024 * 1024), "application/pdf")).status).toBe(413);

    for (let i = 0; i < 5; i++) expect((await upload(leader, project.id, task.id, JPEG(), "image/jpeg")).status).toBe(201);
    const sixth = await upload(leader, project.id, task.id, JPEG(), "image/jpeg");
    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toMatch(/at most 5/);

    // Fill the group's storage with rows on another task, then the next upload must be refused.
    const other = await createTask(leader, project.id, { title: "Other" });
    await prisma.taskAttachment.create({
      data: { taskId: other.id, projectId: project.id, kind: "PDF", mime: "application/pdf", filename: "big.pdf", size: 50 * 1024 * 1024 - 10, data: new Uint8Array(1) },
    });
    const full = await upload(leader, project.id, other.id, JPEG(), "image/jpeg");
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/50 MB/);
  });

  it("limits uploads and removal to people who can edit the task", async () => {
    const { leader, member, member2, project } = await setupGroup();
    const task = await createTask(leader, project.id, { title: "Mine", assignedToUserId: member.id });
    const mine = await upload(member, project.id, task.id, JPEG(), "image/jpeg");
    expect(mine.status).toBe(201);
    expect((await upload(member2, project.id, task.id, JPEG(), "image/jpeg")).status).toBe(403);
    expect((await request(app).delete(`${tbase(project.id, task.id)}/attachments/${mine.body.id}`).set("Authorization", as(member2))).status).toBe(403);
    expect((await request(app).delete(`${tbase(project.id, task.id)}/attachments/${mine.body.id}`).set("Authorization", as(member))).status).toBe(200);
    expect((await details(leader, project.id, task.id)).attachments).toHaveLength(0);
  });
});

describe("comments and mentions", () => {
  it("lets any member comment; stores <@id> tokens; validates mentions are group members", async () => {
    const { leader, member, outsider, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    const ok = await comment(member, project.id, task.id, `Hi <@${leader.id}> please look`);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.body).toBe(`Hi <@${leader.id}> please look`);

    expect((await comment(member, project.id, task.id, `Hi <@${outsider.id}>`)).status).toBe(400);
    expect((await comment(member, project.id, task.id, "   ")).status).toBe(400);
    expect((await comment(member, project.id, task.id, "x".repeat(2001))).status).toBe(400);
    expect((await comment(member, project.id, task.id, "x".repeat(2000))).status).toBe(201);
    expect((await comment(outsider, project.id, task.id, "hi")).status).toBe(403);
  });

  it("edits and deletes only your own comment", async () => {
    const { leader, member, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    const c = (await comment(member, project.id, task.id, "first")).body;
    const url = `${tbase(project.id, task.id)}/comments/${c.id}`;
    expect((await request(app).patch(url).set("Authorization", as(leader)).send({ body: "hijack" })).status).toBe(403);
    expect((await request(app).delete(url).set("Authorization", as(leader))).status).toBe(403);
    const edited = await request(app).patch(url).set("Authorization", as(member)).send({ body: "second" });
    expect(edited.status).toBe(200);
    expect(edited.body.editedAt).not.toBeNull();
    expect((await request(app).delete(url).set("Authorization", as(member))).status).toBe(200);
    expect((await details(leader, project.id, task.id)).comments).toHaveLength(0);
  });

  it("auto-watches commenters; watch and unwatch work", async () => {
    const { leader, member, member2, project } = await setupGroup();
    const task = await createTask(leader, project.id); // creator watches
    expect((await details(leader, project.id, task.id)).watchers).toEqual([leader.id]);
    await comment(member, project.id, task.id, "hello");
    expect((await details(leader, project.id, task.id)).watchers.sort()).toEqual([leader.id, member.id].sort());

    const on = await request(app).put(`${tbase(project.id, task.id)}/watch`).set("Authorization", as(member2));
    expect(on.status).toBe(200);
    expect(on.body.watching).toBe(true);
    const off = await request(app).delete(`${tbase(project.id, task.id)}/watch`).set("Authorization", as(member2));
    expect(off.body.watching).toBe(false);
    expect(off.body.watchers).not.toContain(member2.id);
  });

  it("auto-watches the assignee on create and on assign", async () => {
    const { leader, member, member2, project } = await setupGroup();
    const task = await createTask(leader, project.id, { title: "T", assignedToUserId: member.id });
    expect((await details(leader, project.id, task.id)).watchers).toEqual(expect.arrayContaining([leader.id, member.id]));
    const res = await request(app).patch(tbase(project.id, task.id)).set("Authorization", as(leader))
      .send({ expectedVersion: task.version, assignedToUserId: member2.id });
    expect(res.status).toBe(200);
    expect((await details(leader, project.id, task.id)).watchers).toContain(member2.id);
  });
});

describe("notifications", () => {
  const alertsOf = (userId: number, type: string) =>
    prisma.alert.findMany({ where: { recipientId: userId, type: type as never }, orderBy: { id: "asc" } });

  it("notifies @mentioned members always (even non-watchers), never the actor", async () => {
    const { leader, member, member2, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    await comment(member, project.id, task.id, `<@${member2.id}> and <@${member.id}> take a look`);
    const mentioned = await alertsOf(member2.id, "TASK_MENTIONED");
    expect(mentioned).toHaveLength(1);
    expect(mentioned[0]!.link).toBe(`/student/group/${project.id}?tab=tasks&task=${task.id}`);
    expect(await alertsOf(member.id, "TASK_MENTIONED")).toHaveLength(0);
  });

  it("notifies watchers of a comment (not the actor, not people already mentioned) and collapses a flood", async () => {
    const { leader, member, member2, project } = await setupGroup();
    const task = await createTask(leader, project.id, { title: "T", assignedToUserId: member.id }); // leader + member watch
    await request(app).put(`${tbase(project.id, task.id)}/watch`).set("Authorization", as(member2));

    await comment(member, project.id, task.id, `one <@${member2.id}>`);
    expect(await alertsOf(member.id, "TASK_COMMENTED")).toHaveLength(0); // actor
    expect(await alertsOf(leader.id, "TASK_COMMENTED")).toHaveLength(1);
    expect(await alertsOf(member2.id, "TASK_COMMENTED")).toHaveLength(0); // mentioned instead
    expect(await alertsOf(member2.id, "TASK_MENTIONED")).toHaveLength(1);

    await comment(member, project.id, task.id, "two");
    await comment(member, project.id, task.id, "three");
    const collapsed = await alertsOf(leader.id, "TASK_COMMENTED");
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.message).toMatch(/commented on/);
  });

  it("does not send comment alerts to someone who unwatched", async () => {
    const { leader, member, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    await request(app).delete(`${tbase(project.id, task.id)}/watch`).set("Authorization", as(leader));
    await comment(member, project.id, task.id, "hello");
    expect(await alertsOf(leader.id, "TASK_COMMENTED")).toHaveLength(0);
  });

  it("notifies watchers (not the actor) of a status change, via move and bulk", async () => {
    const { leader, member, project } = await setupGroup();
    const task = await createTask(leader, project.id, { title: "T", assignedToUserId: member.id });
    const moved = await request(app).post(`${tbase(project.id, task.id)}/move`).set("Authorization", as(member))
      .send({ status: "IN_PROGRESS", expectedVersion: task.version });
    expect(moved.status).toBe(200);
    const forLeader = await alertsOf(leader.id, "TASK_STATUS_CHANGED");
    expect(forLeader).toHaveLength(1);
    expect(forLeader[0]!.message).toMatch(/In progress/);
    expect(await alertsOf(member.id, "TASK_STATUS_CHANGED")).toHaveLength(0);

    // Reordering inside the same column is not a status change.
    await request(app).post(`${tbase(project.id, task.id)}/move`).set("Authorization", as(member))
      .send({ status: "IN_PROGRESS", expectedVersion: moved.body.version });
    expect(await alertsOf(leader.id, "TASK_STATUS_CHANGED")).toHaveLength(1);

    const bulk = await request(app).post(`${base(project.id)}/bulk`).set("Authorization", as(leader))
      .send({ taskIds: [task.id], action: { type: "status", status: "IN_REVIEW" } });
    expect(bulk.status).toBe(200);
    expect(await alertsOf(member.id, "TASK_STATUS_CHANGED")).toHaveLength(1);
    expect(await alertsOf(leader.id, "TASK_STATUS_CHANGED")).toHaveLength(1); // actor of the bulk edit
  });

  it("notifies members mentioned in a description (new mentions only) and rejects non-members", async () => {
    const { leader, member, outsider, project } = await setupGroup();
    const created = await createTask(leader, project.id, { title: "T", description: `cc <@${member.id}>` });
    expect(await alertsOf(member.id, "TASK_MENTIONED")).toHaveLength(1);
    const same = await request(app).patch(tbase(project.id, created.id)).set("Authorization", as(leader))
      .send({ expectedVersion: created.version, description: `cc <@${member.id}> again` });
    expect(same.status).toBe(200);
    expect(await alertsOf(member.id, "TASK_MENTIONED")).toHaveLength(1); // collapsed / not re-sent
    const bad = await request(app).patch(tbase(project.id, created.id)).set("Authorization", as(leader))
      .send({ expectedVersion: same.body.version, description: `<@${outsider.id}>` });
    expect(bad.status).toBe(400);
  });
});

describe("history", () => {
  it("lists activity newest first and is read-only for the instructor", async () => {
    const { leader, instructor, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    await request(app).post(`${tbase(project.id, task.id)}/move`).set("Authorization", as(leader))
      .send({ status: "IN_PROGRESS", expectedVersion: task.version });
    const d = await details(instructor, project.id, task.id);
    expect(d.activity.map((a) => a.type)).toEqual(["status_changed", "created"]);
    expect(d.activity[0]!.data).toEqual({ from: "TODO", to: "IN_PROGRESS" });
    expect(d.watching).toBe(false);
  });
});

describe("tasks never touch scoring inputs", () => {
  it("writes no EditEvent, EditSession or Report rows", async () => {
    const { leader, project } = await setupGroup();
    const task = await createTask(leader, project.id);
    await comment(leader, project.id, task.id, "hi");
    await request(app).post(`${tbase(project.id, task.id)}/subtasks`).set("Authorization", as(leader)).send({ title: "x" });
    await upload(leader, project.id, task.id, JPEG(), "image/jpeg");
    expect(await prisma.editEvent.count()).toBe(0);
    expect(await prisma.editSession.count()).toBe(0);
    expect(await prisma.report.count()).toBe(0);
  });
});

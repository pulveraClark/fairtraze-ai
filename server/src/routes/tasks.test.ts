import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { BoardResponse, BoardTask } from "@shared/taskTypes.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "../../test/factories.js";
import { prisma } from "../lib/prisma.js";

// This file exercises the Tasks routes; the 30/min creation limiter has its own test
// (test/taskRateLimit.test.ts). Ids restart on every truncate, so the real per-user counter
// would otherwise accumulate across this file's tests.
vi.mock("../middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../middleware/security.js")>("../middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, taskWriteLimiter: passthrough };
});

const { createApp } = await import("../app.js");
const app = createApp();

type U = Awaited<ReturnType<typeof createUser>>["user"];

async function setupGroup(opts: { deadline?: Date; groupName?: string } = {}) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id);
  if (opts.deadline) await prisma.assignment.update({ where: { id: assignment.id }, data: { deadline: opts.deadline } });
  const project = await createProject({ assignmentId: assignment.id, groupName: opts.groupName });

  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Leader Lee" });
  const { user: member } = await createUser({ systemRole: "STUDENT", name: "Member Mo" });
  const { user: member2 } = await createUser({ systemRole: "STUDENT", name: "Member Ben" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  await createMembership(member2.id, project.id, "MEMBER");

  return { instructor, leader, member, member2, outsider, admin, project, assignment, classSection };
}

const as = (u: U) => authHeaderFor(u);
const base = (projectId: number) => `/api/groups/${projectId}/tasks`;

async function createTask(u: U, projectId: number, body: Record<string, unknown>): Promise<BoardTask> {
  const res = await request(app).post(base(projectId)).set("Authorization", as(u)).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as BoardTask;
}

async function board(u: U, projectId: number): Promise<BoardResponse> {
  const res = await request(app).get(base(projectId)).set("Authorization", as(u));
  expect(res.status).toBe(200);
  return res.body as BoardResponse;
}

const move = (u: U, projectId: number, task: { id: number; version: number }, body: Record<string, unknown>) =>
  request(app).post(`${base(projectId)}/${task.id}/move`).set("Authorization", as(u))
    .send({ expectedVersion: task.version, ...body });

const patch = (u: U, projectId: number, task: { id: number; version: number }, body: Record<string, unknown>) =>
  request(app).patch(`${base(projectId)}/${task.id}`).set("Authorization", as(u))
    .send({ expectedVersion: task.version, ...body });

describe("board access (who may open a group's tasks)", () => {
  it("lets members, the owning instructor and an admin read the board", async () => {
    const { leader, member, instructor, admin, project } = await setupGroup();
    for (const u of [leader, member, instructor, admin]) {
      const b = await board(u, project.id);
      expect(b.group.id).toBe(project.id);
    }
    expect((await board(leader, project.id)).viewer).toMatchObject({ isLeader: true, readOnly: false, canCreate: true });
    expect((await board(member, project.id)).viewer).toMatchObject({ isLeader: false, readOnly: false, canCreate: true });
    expect((await board(instructor, project.id)).viewer).toMatchObject({ readOnly: true, canCreate: false });
    expect((await board(admin, project.id)).viewer).toMatchObject({ readOnly: true, canCreate: false });
  });

  it("rejects an outsider and an instructor who does not own the class", async () => {
    const { outsider, project } = await setupGroup();
    const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
    await createClassSection(otherInstructor.id);

    expect((await request(app).get(base(project.id)).set("Authorization", as(outsider))).status).toBe(403);
    expect((await request(app).get(base(project.id)).set("Authorization", as(otherInstructor))).status).toBe(403);
    expect((await request(app).get(base(project.id))).status).toBe(401);
  });

  it("does not open an assignment-less group to any instructor (no owner); admin can view, members can use it", async () => {
    const { user: someInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: leader } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject({ assignmentId: null });
    await createMembership(leader.id, project.id, "LEADER");

    expect((await request(app).get(base(project.id)).set("Authorization", as(someInstructor))).status).toBe(403);
    expect((await request(app).post(base(project.id)).set("Authorization", as(someInstructor)).send({ title: "x" })).status).toBe(403);
    expect((await request(app).get(base(project.id)).set("Authorization", as(admin))).status).toBe(200);
    await createTask(leader, project.id, { title: "Works for the group itself" });
  });

  it("returns 404 for a group that does not exist and 400 for a bad id", async () => {
    const { leader } = await setupGroup();
    expect((await request(app).get(base(999999)).set("Authorization", as(leader))).status).toBe(404);
    expect((await request(app).get("/api/groups/abc/tasks").set("Authorization", as(leader))).status).toBe(400);
  });
});

describe("creating tasks", () => {
  it("lets the leader create a task with an assignee, milestone and labels; numbers count up per group", async () => {
    const { leader, member, project } = await setupGroup({ groupName: "Team Rocket" });
    const ms = await request(app).post(`/api/groups/${project.id}/milestones`).set("Authorization", as(leader)).send({ name: "Alpha" });
    const label = await request(app).post(`/api/groups/${project.id}/labels`).set("Authorization", as(leader)).send({ name: "ui", color: "blue" });

    const t1 = await createTask(leader, project.id, {
      title: "Design the poster", assignedToUserId: member.id, milestoneId: ms.body.id, labelIds: [label.body.id], priority: "HIGH", dueDate: "2026-11-01",
    });
    const t2 = await createTask(leader, project.id, { title: "Second" });

    expect(t1).toMatchObject({
      key: "TR-1", number: 1, status: "TODO", done: false, completedAt: null, priority: "HIGH", dueDate: "2026-11-01",
      assignedToUserId: member.id, milestoneId: ms.body.id, labelIds: [label.body.id], version: 1,
    });
    expect(t2).toMatchObject({ key: "TR-2", number: 2, priority: "MEDIUM", assignedToUserId: null });
    expect(t2.position).toBeGreaterThan(t1.position);
  });

  it("keeps the key stable after the group is renamed, and numbers are per group", async () => {
    const a = await setupGroup({ groupName: "Alpha Team" });
    const t1 = await createTask(a.leader, a.project.id, { title: "One" });
    expect(t1.key).toBe("AT-1");
    await prisma.project.update({ where: { id: a.project.id }, data: { groupName: "Completely Different" } });
    const t2 = await createTask(a.leader, a.project.id, { title: "Two" });
    expect(t2.key).toBe("AT-2");

    const b = await setupGroup({ groupName: "Beta Squad" });
    expect((await createTask(b.leader, b.project.id, { title: "Other group" })).key).toBe("BS-1");
  });

  it("lets any member create a task, but only unassigned and in To do", async () => {
    const { member, project } = await setupGroup();
    const t = await createTask(member, project.id, { title: "Idea from a member" });
    expect(t).toMatchObject({ status: "TODO", assignedToUserId: null, createdByUserId: member.id });
  });

  it("rejects a member trying to assign, set a milestone or labels at creation", async () => {
    const { leader, member, project } = await setupGroup();
    const ms = await request(app).post(`/api/groups/${project.id}/milestones`).set("Authorization", as(leader)).send({ name: "M" });
    const lb = await request(app).post(`/api/groups/${project.id}/labels`).set("Authorization", as(leader)).send({ name: "L", color: "red" });
    for (const extra of [{ assignedToUserId: member.id }, { milestoneId: ms.body.id }, { labelIds: [lb.body.id] }]) {
      const res = await request(app).post(base(project.id)).set("Authorization", as(member)).send({ title: "x", ...extra });
      expect(res.status).toBe(403);
    }
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("rejects creation by the owning instructor, an admin and an outsider (view only / no access)", async () => {
    const { instructor, admin, outsider, project } = await setupGroup();
    for (const u of [instructor, admin, outsider]) {
      const res = await request(app).post(base(project.id)).set("Authorization", as(u)).send({ title: "nope" });
      expect(res.status).toBe(403);
    }
  });

  it("validates input: title required, assignee must be a member, milestone/labels must belong to the group", async () => {
    const { leader, outsider, project } = await setupGroup();
    const other = await setupGroup();
    const foreignMs = await request(app).post(`/api/groups/${other.project.id}/milestones`).set("Authorization", as(other.leader)).send({ name: "Theirs" });
    const foreignLb = await request(app).post(`/api/groups/${other.project.id}/labels`).set("Authorization", as(other.leader)).send({ name: "Theirs", color: "red" });

    const post = (b: Record<string, unknown>) => request(app).post(base(project.id)).set("Authorization", as(leader)).send(b);
    expect((await post({ title: "  " })).status).toBe(400);
    expect((await post({ title: "x", assignedToUserId: outsider.id })).status).toBe(400);
    expect((await post({ title: "x", milestoneId: foreignMs.body.id })).status).toBe(400);
    expect((await post({ title: "x", labelIds: [foreignLb.body.id] })).status).toBe(400);
    expect((await post({ title: "x", dueDate: "2026-02-31" })).status).toBe(400);
    expect((await post({ title: "x", priority: "URGENT" })).status).toBe(400);
  });

  it("warns when the due date is after the project deadline", async () => {
    const { leader, project } = await setupGroup({ deadline: new Date("2026-11-14T10:00:00Z") });
    const after = await request(app).post(base(project.id)).set("Authorization", as(leader)).send({ title: "Late", dueDate: "2026-11-20" });
    expect(after.status).toBe(201);
    expect(after.body.warnings).toEqual(["This is after the project deadline (Nov 14)."]);
    const ok = await request(app).post(base(project.id)).set("Authorization", as(leader)).send({ title: "On time", dueDate: "2026-11-14" });
    expect(ok.body.warnings).toBeUndefined();
  });

  it("records a History entry for creation and for the assignment", async () => {
    const { leader, member, project } = await setupGroup();
    const t = await createTask(leader, project.id, { title: "T", assignedToUserId: member.id });
    const rows = await prisma.taskActivity.findMany({ where: { taskId: t.id }, orderBy: { id: "asc" } });
    expect(rows.map((r) => r.type)).toEqual(["created", "assigned"]);
    expect(rows[0]!.actorId).toBe(leader.id);
  });
});

describe("moving tasks: one test per permission rule", () => {
  async function assigned(g: Awaited<ReturnType<typeof setupGroup>>) {
    return createTask(g.leader, g.project.id, { title: "Mine", assignedToUserId: g.member.id });
  }

  it("leader can move any task to any column, including Done and back", async () => {
    const g = await setupGroup();
    const t = await assigned(g);
    const done = await move(g.leader, g.project.id, t, { status: "DONE" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: "DONE", done: true });
    expect(done.body.completedAt).not.toBeNull();
    const back = await move(g.leader, g.project.id, done.body, { status: "IN_PROGRESS" });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ status: "IN_PROGRESS", done: false, completedAt: null });
  });

  it("assignee can move own task among To do, In progress and In review", async () => {
    const g = await setupGroup();
    let t = await assigned(g);
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "TODO"] as const) {
      const res = await move(g.member, g.project.id, t, { status });
      expect(res.status).toBe(200);
      t = res.body;
      expect(t.status).toBe(status);
    }
  });

  it("assignee cannot move a task into Done", async () => {
    const g = await setupGroup();
    const t = await assigned(g);
    const res = await move(g.member, g.project.id, t, { status: "DONE" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/leader can mark a task Done/);
    expect((await prisma.task.findUnique({ where: { id: t.id } }))!.status).toBe("TODO");
  });

  it("assignee cannot move a task out of Done", async () => {
    const g = await setupGroup();
    const t = await assigned(g);
    const done = await move(g.leader, g.project.id, t, { status: "DONE" });
    const res = await move(g.member, g.project.id, done.body, { status: "IN_REVIEW" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/out of Done/);
  });

  it("a member cannot move someone else's task", async () => {
    const g = await setupGroup();
    const t = await assigned(g);
    const res = await move(g.member2, g.project.id, t, { status: "IN_PROGRESS" });
    expect(res.status).toBe(403);
  });

  it("only the leader can move an unassigned task", async () => {
    const g = await setupGroup();
    const t = await createTask(g.member, g.project.id, { title: "Unassigned" });
    const denied = await move(g.member, g.project.id, t, { status: "IN_PROGRESS" });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/unassigned/);
    expect((await move(g.leader, g.project.id, t, { status: "IN_PROGRESS" })).status).toBe(200);
  });

  it("instructor, admin and outsider cannot move tasks", async () => {
    const g = await setupGroup();
    const t = await assigned(g);
    for (const u of [g.instructor, g.admin, g.outsider]) {
      expect((await move(u, g.project.id, t, { status: "IN_PROGRESS" })).status).toBe(403);
    }
  });

  it("mirrors the rules per task in the board payload (grip / allowed columns)", async () => {
    const g = await setupGroup();
    await assigned(g);
    await createTask(g.leader, g.project.id, { title: "Unassigned" });

    const asLeader = (await board(g.leader, g.project.id)).tasks;
    expect(asLeader.every((t) => t.permissions.move && t.permissions.allowedStatuses.length === 4)).toBe(true);

    const asMember = (await board(g.member, g.project.id)).tasks;
    const mine = asMember.find((t) => t.title === "Mine")!;
    expect(mine.permissions).toMatchObject({ move: true, edit: true, setDue: true, assign: false, delete: false });
    expect(mine.permissions.allowedStatuses).toEqual(["TODO", "IN_PROGRESS", "IN_REVIEW"]);
    const unassigned = asMember.find((t) => t.title === "Unassigned")!;
    expect(unassigned.permissions).toMatchObject({ move: false, edit: false, allowedStatuses: [] });

    const asInstructor = (await board(g.instructor, g.project.id)).tasks;
    expect(asInstructor.every((t) => !t.permissions.move && !t.permissions.edit && !t.permissions.delete)).toBe(true);
  });

  it("writes a History entry for a status change but not for a pure reorder", async () => {
    const g = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A" });
    const b = await createTask(g.leader, g.project.id, { title: "B" });
    await move(g.leader, g.project.id, a, { status: "IN_PROGRESS" });
    await move(g.leader, g.project.id, b, { status: "TODO" });
    const aRows = await prisma.taskActivity.findMany({ where: { taskId: a.id }, orderBy: { id: "asc" } });
    expect(aRows.map((r) => r.type)).toEqual(["created", "status_changed"]);
    expect(aRows[1]!.data).toEqual({ from: "TODO", to: "IN_PROGRESS" });
    const bRows = await prisma.taskActivity.findMany({ where: { taskId: b.id } });
    expect(bRows.map((r) => r.type)).toEqual(["created"]);
  });
});

describe("ordering inside a column", () => {
  it("places a card before/after a neighbour and keeps the order stable", async () => {
    const g = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A" });
    const b = await createTask(g.leader, g.project.id, { title: "B" });
    const c = await createTask(g.leader, g.project.id, { title: "C" });
    const titles = async () => (await board(g.leader, g.project.id)).tasks.filter((t) => t.status === "TODO").map((t) => t.title);
    expect(await titles()).toEqual(["A", "B", "C"]);

    const moved = await move(g.leader, g.project.id, c, { status: "TODO", beforeId: a.id });
    expect(moved.status).toBe(200);
    expect(await titles()).toEqual(["C", "A", "B"]);

    const again = await move(g.leader, g.project.id, moved.body, { status: "TODO", afterId: a.id });
    expect(again.status).toBe(200);
    expect(await titles()).toEqual(["A", "C", "B"]);
    expect(b.position).toBeGreaterThan(a.position);
  });

  it("appends to the end of another column when no neighbour is given, and rejects a neighbour from another column", async () => {
    const g = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A" });
    const b = await createTask(g.leader, g.project.id, { title: "B" });
    const first = await move(g.leader, g.project.id, a, { status: "IN_PROGRESS" });
    const second = await move(g.leader, g.project.id, b, { status: "IN_PROGRESS" });
    expect(second.body.position).toBeGreaterThan(first.body.position);

    const c = await createTask(g.leader, g.project.id, { title: "C" });
    const bad = await move(g.leader, g.project.id, c, { status: "IN_PROGRESS", afterId: c.id });
    expect(bad.status).toBe(400);
    const bad2 = await move(g.leader, g.project.id, c, { status: "DONE", afterId: a.id });
    expect(bad2.status).toBe(400);
  });

  it("renumbers a column when two neighbours are too close for a midpoint, without losing order", async () => {
    const g = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A" });
    const b = await createTask(g.leader, g.project.id, { title: "B" });
    const c = await createTask(g.leader, g.project.id, { title: "C" });
    // Squeeze B against A (what many successive inserts between them would eventually do).
    await prisma.task.update({ where: { id: b.id }, data: { position: a.position + 1e-7 } });

    const res = await move(g.leader, g.project.id, c, { status: "TODO", afterId: a.id });
    expect(res.status).toBe(200);
    const tasks = (await board(g.leader, g.project.id)).tasks.filter((t) => t.status === "TODO");
    expect(tasks.map((t) => t.title)).toEqual(["A", "C", "B"]);
    const positions = tasks.map((t) => t.position);
    expect(new Set(positions).size).toBe(3);
    expect(positions[1]! - positions[0]!).toBeGreaterThan(1);
    expect(positions[2]! - positions[1]!).toBeGreaterThan(1);
  });
});

describe("concurrency (version field, 409, no silent overwrite)", () => {
  it("returns 409 with the current task when the version is stale, and keeps the other writer's change", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "Original" });

    const first = await patch(g.leader, g.project.id, t, { title: "Leader edit" });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(2);

    const stale = await patch(g.leader, g.project.id, t, { title: "Stale edit" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    expect(stale.body.task).toMatchObject({ title: "Leader edit", version: 2 });
    expect((await prisma.task.findUnique({ where: { id: t.id } }))!.title).toBe("Leader edit");
  });

  it("returns 409 for a stale move and writes nothing", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "T" });
    await patch(g.leader, g.project.id, t, { priority: "HIGH" });
    const stale = await move(g.leader, g.project.id, t, { status: "IN_PROGRESS" });
    expect(stale.status).toBe(409);
    expect((await prisma.task.findUnique({ where: { id: t.id } }))!.status).toBe("TODO");
    expect(await prisma.taskActivity.count({ where: { taskId: t.id, type: "status_changed" } })).toBe(0);
  });

  it("bumps the version on every write and requires expectedVersion on PATCH", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "T" });
    const m = await move(g.leader, g.project.id, t, { status: "IN_PROGRESS" });
    expect(m.body.version).toBe(2);
    const noVersion = await request(app).patch(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.leader)).send({ title: "x" });
    expect(noVersion.status).toBe(400);
  });

  it("does not bump the version when nothing actually changed", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "Same" });
    const res = await patch(g.leader, g.project.id, t, { title: "Same", priority: "MEDIUM" });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
  });
});

describe("editing tasks", () => {
  it("lets the assignee edit their own task and change its due date, but not the assignee or milestone", async () => {
    const g = await setupGroup();
    const ms = await request(app).post(`/api/groups/${g.project.id}/milestones`).set("Authorization", as(g.leader)).send({ name: "M" });
    const t = await createTask(g.leader, g.project.id, { title: "Mine", assignedToUserId: g.member.id });

    const edit = await patch(g.member, g.project.id, t, { title: "Renamed", priority: "LOW", dueDate: "2026-12-01", description: "details" });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ title: "Renamed", priority: "LOW", dueDate: "2026-12-01", description: "details" });

    const reassign = await patch(g.member, g.project.id, edit.body, { assignedToUserId: g.member2.id });
    expect(reassign.status).toBe(403);
    const milestone = await patch(g.member, g.project.id, edit.body, { milestoneId: ms.body.id });
    expect(milestone.status).toBe(403);
  });

  it("rejects editing a task that is not yours, an unassigned task, and a Done task (assignee)", async () => {
    const g = await setupGroup();
    const mine = await createTask(g.leader, g.project.id, { title: "Mine", assignedToUserId: g.member.id });
    const unassigned = await createTask(g.leader, g.project.id, { title: "Nobody" });

    expect((await patch(g.member2, g.project.id, mine, { title: "Hijack" })).status).toBe(403);
    expect((await patch(g.member, g.project.id, unassigned, { title: "Hijack" })).status).toBe(403);
    expect((await patch(g.member2, g.project.id, mine, { dueDate: "2026-12-01" })).status).toBe(403);

    const done = await move(g.leader, g.project.id, mine, { status: "DONE" });
    expect((await patch(g.member, g.project.id, done.body, { title: "After done" })).status).toBe(403);
    expect((await patch(g.leader, g.project.id, done.body, { title: "Leader may" })).status).toBe(200);
  });

  it("lets only the leader assign, with History and a notification; instructor and admin cannot edit", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "T" });
    const res = await patch(g.leader, g.project.id, t, { assignedToUserId: g.member.id });
    expect(res.status).toBe(200);
    expect(await prisma.taskActivity.count({ where: { taskId: t.id, type: "assigned" } })).toBe(1);
    const alerts = await prisma.alert.findMany({ where: { recipientId: g.member.id, type: "TASK_ASSIGNED" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.link).toBe(`/student/group/${g.project.id}?tab=tasks&task=${t.id}`);

    for (const u of [g.instructor, g.admin]) {
      expect((await patch(u, g.project.id, res.body, { title: "no" })).status).toBe(403);
    }
    const reject = await patch(g.leader, g.project.id, res.body, { assignedToUserId: g.outsider.id });
    expect(reject.status).toBe(400);
  });

  it("does not notify the leader about assigning a task to themselves", async () => {
    const g = await setupGroup();
    await createTask(g.leader, g.project.id, { title: "Mine", assignedToUserId: g.leader.id });
    expect(await prisma.alert.count({ where: { type: "TASK_ASSIGNED" } })).toBe(0);
  });

  it("replaces labels and records History; a clear leaves the task without labels", async () => {
    const g = await setupGroup();
    const l1 = await request(app).post(`/api/groups/${g.project.id}/labels`).set("Authorization", as(g.leader)).send({ name: "a", color: "blue" });
    const l2 = await request(app).post(`/api/groups/${g.project.id}/labels`).set("Authorization", as(g.leader)).send({ name: "b", color: "red" });
    const t = await createTask(g.leader, g.project.id, { title: "T", labelIds: [l1.body.id] });
    const r1 = await patch(g.leader, g.project.id, t, { labelIds: [l2.body.id, l1.body.id] });
    expect(r1.body.labelIds).toEqual([l1.body.id, l2.body.id].sort((a, b) => a - b));
    const r2 = await patch(g.leader, g.project.id, r1.body, { labelIds: [] });
    expect(r2.body.labelIds).toEqual([]);
    expect(await prisma.taskActivity.count({ where: { taskId: t.id, type: "labels_changed" } })).toBe(2);
  });

  it("warns when a changed due date is after the deadline and 400s on a bad date", async () => {
    const g = await setupGroup({ deadline: new Date("2026-11-14T10:00:00Z") });
    const t = await createTask(g.leader, g.project.id, { title: "T" });
    const res = await patch(g.leader, g.project.id, t, { dueDate: "2026-12-25" });
    expect(res.body.warnings).toEqual(["This is after the project deadline (Nov 14)."]);
    expect((await patch(g.leader, g.project.id, res.body, { dueDate: "tomorrow" })).status).toBe(400);
  });

  it("lets the leader pick a document heading for a task and the assignee change it", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "Write intro", assignedToUserId: g.member.id });
    const set = await patch(g.leader, g.project.id, t, { docHeading: "Introduction" });
    expect(set.body.docHeading).toBe("Introduction");
    const change = await patch(g.member, g.project.id, set.body, { docHeading: "Background" });
    expect(change.body.docHeading).toBe("Background");
    expect((await patch(g.member2, g.project.id, change.body, { docHeading: "x" })).status).toBe(403);
  });
});

describe("deleting tasks", () => {
  it("only the leader can delete; members, instructor and admin cannot", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "Temp", assignedToUserId: g.member.id });
    for (const u of [g.member, g.instructor, g.admin, g.outsider]) {
      const res = await request(app).delete(`${base(g.project.id)}/${t.id}`).set("Authorization", as(u));
      expect(res.status).toBe(403);
    }
    const ok = await request(app).delete(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.leader));
    expect(ok.status).toBe(200);
    expect(await prisma.task.findUnique({ where: { id: t.id } })).toBeNull();
    expect(await prisma.taskActivity.count({ where: { taskId: t.id } })).toBe(0);
  });

  it("returns 404 for a task id from another group", async () => {
    const g = await setupGroup();
    const other = await setupGroup();
    const t = await createTask(other.leader, other.project.id, { title: "Theirs" });
    const res = await request(app).delete(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.leader));
    expect(res.status).toBe(404);
  });
});

describe("bulk edit (leader only)", () => {
  const bulk = (u: U, projectId: number, body: Record<string, unknown>) =>
    request(app).post(`${base(projectId)}/bulk`).set("Authorization", as(u)).send(body);

  it("moves several tasks to Done with one History entry per task", async () => {
    const g = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A" });
    const b = await createTask(g.leader, g.project.id, { title: "B" });
    const res = await bulk(g.leader, g.project.id, { taskIds: [a.id, b.id], action: { type: "status", status: "DONE" } });
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: BoardTask) => t.status)).toEqual(["DONE", "DONE"]);
    for (const id of [a.id, b.id]) {
      expect(await prisma.taskActivity.count({ where: { taskId: id, type: "status_changed" } })).toBe(1);
    }
    const after = (await board(g.leader, g.project.id)).tasks.filter((t) => t.status === "DONE");
    expect(after.map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("assigns several tasks and sends the assignee one notification, not one per task", async () => {
    const g = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A" });
    const b = await createTask(g.leader, g.project.id, { title: "B" });
    const res = await bulk(g.leader, g.project.id, { taskIds: [a.id, b.id], action: { type: "assign", userId: g.member.id } });
    expect(res.status).toBe(200);
    const alerts = await prisma.alert.findMany({ where: { recipientId: g.member.id, type: "TASK_ASSIGNED" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.message).toBe("You were assigned 2 tasks");
  });

  it("changes priority, milestone and labels in bulk and skips tasks that already match", async () => {
    const g = await setupGroup();
    const ms = await request(app).post(`/api/groups/${g.project.id}/milestones`).set("Authorization", as(g.leader)).send({ name: "M" });
    const lb = await request(app).post(`/api/groups/${g.project.id}/labels`).set("Authorization", as(g.leader)).send({ name: "L", color: "teal" });
    const a = await createTask(g.leader, g.project.id, { title: "A", priority: "HIGH" });
    const b = await createTask(g.leader, g.project.id, { title: "B" });
    await bulk(g.leader, g.project.id, { taskIds: [a.id, b.id], action: { type: "priority", priority: "HIGH" } });
    expect(await prisma.taskActivity.count({ where: { taskId: a.id, type: "priority_changed" } })).toBe(0);
    expect(await prisma.taskActivity.count({ where: { taskId: b.id, type: "priority_changed" } })).toBe(1);

    const m = await bulk(g.leader, g.project.id, { taskIds: [a.id, b.id], action: { type: "milestone", milestoneId: ms.body.id } });
    expect(m.body.tasks.every((t: BoardTask) => t.milestoneId === ms.body.id)).toBe(true);
    const l = await bulk(g.leader, g.project.id, { taskIds: [a.id, b.id], action: { type: "labels", add: [lb.body.id] } });
    expect(l.body.tasks.every((t: BoardTask) => t.labelIds.includes(lb.body.id))).toBe(true);
  });

  it("skips a task that would exceed the label limit, applies the rest, and reports it", async () => {
    const g = await setupGroup();
    const colors = ["teal", "teal", "teal", "teal", "teal", "teal"];
    const labelIds: number[] = [];
    for (const [i, color] of colors.entries()) {
      const r = await request(app).post(`/api/groups/${g.project.id}/labels`).set("Authorization", as(g.leader)).send({ name: `L${i}`, color });
      labelIds.push(r.body.id);
    }
    const full = await createTask(g.leader, g.project.id, { title: "Full", labelIds: labelIds.slice(0, 5) });
    const free = await createTask(g.leader, g.project.id, { title: "Free" });
    const res = await bulk(g.leader, g.project.id, { taskIds: [full.id, free.id], action: { type: "labels", add: [labelIds[5]] } });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toEqual([{ taskId: full.id, key: full.key, reason: expect.stringContaining("at most 5 labels") }]);
    const byId = new Map((res.body.tasks as BoardTask[]).map((t) => [t.id, t]));
    expect(byId.get(free.id)!.labelIds).toEqual([labelIds[5]]);
    expect(byId.get(full.id)!.labelIds).toHaveLength(5);
    expect(await prisma.taskActivity.count({ where: { taskId: full.id, type: "labels_changed" } })).toBe(0);
  });

  it("reports an empty skipped list when everything applied", async () => {
    const g = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A" });
    const res = await bulk(g.leader, g.project.id, { taskIds: [a.id], action: { type: "priority", priority: "HIGH" } });
    expect(res.body.skipped).toEqual([]);
  });

  it("is leader only and refuses tasks from another group", async () => {
    const g = await setupGroup();
    const other = await setupGroup();
    const a = await createTask(g.leader, g.project.id, { title: "A", assignedToUserId: g.member.id });
    const theirs = await createTask(other.leader, other.project.id, { title: "Theirs" });
    for (const u of [g.member, g.instructor, g.admin]) {
      expect((await bulk(u, g.project.id, { taskIds: [a.id], action: { type: "status", status: "DONE" } })).status).toBe(403);
    }
    const foreign = await bulk(g.leader, g.project.id, { taskIds: [a.id, theirs.id], action: { type: "status", status: "DONE" } });
    expect(foreign.status).toBe(404);
    expect((await prisma.task.findUnique({ where: { id: a.id } }))!.status).toBe("TODO");
  });
});

describe("milestones", () => {
  const ms = (u: U, projectId: number, body: Record<string, unknown>) =>
    request(app).post(`/api/groups/${projectId}/milestones`).set("Authorization", as(u)).send(body);

  it("lets the leader create, rename and delete; tasks keep existing without a milestone", async () => {
    const g = await setupGroup();
    const created = await ms(g.leader, g.project.id, { name: "Beta", dueDate: "2026-11-10" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Beta", dueDate: "2026-11-10" });
    const t = await createTask(g.leader, g.project.id, { title: "In beta", milestoneId: created.body.id });

    const renamed = await request(app).patch(`/api/groups/${g.project.id}/milestones/${created.body.id}`).set("Authorization", as(g.leader)).send({ name: "Beta 2" });
    expect(renamed.body.name).toBe("Beta 2");
    const b = await board(g.leader, g.project.id);
    expect(b.milestones).toEqual([expect.objectContaining({ name: "Beta 2", total: 1, done: 0 })]);

    const del = await request(app).delete(`/api/groups/${g.project.id}/milestones/${created.body.id}`).set("Authorization", as(g.leader));
    expect(del.status).toBe(200);
    expect((await prisma.task.findUnique({ where: { id: t.id } }))!.milestoneId).toBeNull();
  });

  it("warns when a milestone is due after the project deadline", async () => {
    const g = await setupGroup({ deadline: new Date("2026-11-14T10:00:00Z") });
    const late = await ms(g.leader, g.project.id, { name: "Late", dueDate: "2026-11-30" });
    expect(late.status).toBe(201);
    expect(late.body.warnings).toEqual(["This milestone is after the project deadline (Nov 14)."]);
    const fine = await ms(g.leader, g.project.id, { name: "Fine", dueDate: "2026-11-01" });
    expect(fine.body.warnings).toBeUndefined();
  });

  it("counts done tasks per milestone and rejects non-leaders and a foreign group's milestone", async () => {
    const g = await setupGroup();
    const other = await setupGroup();
    const created = await ms(g.leader, g.project.id, { name: "M" });
    const t = await createTask(g.leader, g.project.id, { title: "T", milestoneId: created.body.id });
    await move(g.leader, g.project.id, t, { status: "DONE" });
    expect((await board(g.member, g.project.id)).milestones[0]).toMatchObject({ total: 1, done: 1 });

    for (const u of [g.member, g.instructor, g.admin]) {
      expect((await ms(u, g.project.id, { name: "nope" })).status).toBe(403);
    }
    const foreign = await request(app).patch(`/api/groups/${other.project.id}/milestones/${created.body.id}`).set("Authorization", as(other.leader)).send({ name: "x" });
    expect(foreign.status).toBe(404);
    expect((await ms(g.leader, g.project.id, { name: "" })).status).toBe(400);
  });
});

describe("labels", () => {
  const lb = (u: U, projectId: number, body: Record<string, unknown>) =>
    request(app).post(`/api/groups/${projectId}/labels`).set("Authorization", as(u)).send(body);

  it("lets the leader create, edit and delete labels; names are unique ignoring case; colors come from a fixed list", async () => {
    const g = await setupGroup();
    const created = await lb(g.leader, g.project.id, { name: "Backend", color: "green" });
    expect(created.status).toBe(201);
    expect((await lb(g.leader, g.project.id, { name: "backend", color: "red" })).status).toBe(409);
    expect((await lb(g.leader, g.project.id, { name: "Odd", color: "chartreuse" })).status).toBe(400);
    const edited = await request(app).patch(`/api/groups/${g.project.id}/labels/${created.body.id}`).set("Authorization", as(g.leader)).send({ color: "violet" });
    expect(edited.body.color).toBe("violet");
    const t = await createTask(g.leader, g.project.id, { title: "T", labelIds: [created.body.id] });
    const del = await request(app).delete(`/api/groups/${g.project.id}/labels/${created.body.id}`).set("Authorization", as(g.leader));
    expect(del.status).toBe(200);
    expect((await board(g.leader, g.project.id)).tasks.find((x) => x.id === t.id)!.labelIds).toEqual([]);
  });

  it("rejects labels from members, instructor and admin", async () => {
    const g = await setupGroup();
    for (const u of [g.member, g.instructor, g.admin]) {
      expect((await lb(u, g.project.id, { name: "x", color: "red" })).status).toBe(403);
    }
  });
});

describe("old-tab compatibility aliases (PATCH {done}, PUT)", () => {
  it("applies the new rules to PATCH {done}: assignee cannot mark Done, leader can", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "T", assignedToUserId: g.member.id });
    const denied = await request(app).patch(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.member)).send({ done: true });
    expect(denied.status).toBe(403);
    const ok = await request(app).patch(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.leader)).send({ done: true });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ done: true, status: "DONE" });
    expect(ok.body.completedAt).not.toBeNull();
    const reopen = await request(app).patch(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.leader)).send({ done: false });
    expect(reopen.body).toMatchObject({ done: false, status: "TODO", completedAt: null });
  });

  it("PUT edits title/description/assignee for the leader without needing a version, and refuses a plain member", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "Draft" });
    const ok = await request(app).put(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.leader))
      .send({ title: "Final", description: "More", assignedToUserId: g.member.id });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ title: "Final", description: "More", assignedToUserId: g.member.id });
    const denied = await request(app).put(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.member2)).send({ title: "Hijack" });
    expect(denied.status).toBe(403);
  });

  it("keeps the nine legacy task fields on every task", async () => {
    const g = await setupGroup();
    const t = await createTask(g.leader, g.project.id, { title: "T" });
    for (const key of ["id", "projectId", "title", "description", "assignedToUserId", "createdByUserId", "done", "completedAt", "createdAt"]) {
      expect(t).toHaveProperty(key);
    }
    const res = await request(app).get(base(g.project.id)).set("Authorization", as(g.leader));
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });
});

describe("polling: ETag / 304 and payload size", () => {
  it("answers 304 when nothing changed and 200 with a new ETag after a change", async () => {
    const g = await setupGroup();
    await createTask(g.leader, g.project.id, { title: "T" });
    const first = await request(app).get(base(g.project.id)).set("Authorization", as(g.member));
    expect(first.status).toBe(200);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();
    expect(first.headers["cache-control"]).toMatch(/private/);

    const same = await request(app).get(base(g.project.id)).set("Authorization", as(g.member)).set("If-None-Match", etag);
    expect(same.status).toBe(304);
    expect(same.text).toBe("");

    await createTask(g.leader, g.project.id, { title: "Another" });
    const changed = await request(app).get(base(g.project.id)).set("Authorization", as(g.member)).set("If-None-Match", etag);
    expect(changed.status).toBe(200);
    expect(changed.headers.etag).not.toBe(etag);
  });

  it("reports the payload size of a 100-task board", async () => {
    const g = await setupGroup();
    const labels = [] as number[];
    for (const name of ["ui", "api", "docs", "bug"]) {
      const l = await request(app).post(`/api/groups/${g.project.id}/labels`).set("Authorization", as(g.leader)).send({ name, color: "blue" });
      labels.push(l.body.id);
    }
    const m = await request(app).post(`/api/groups/${g.project.id}/milestones`).set("Authorization", as(g.leader)).send({ name: "Beta", dueDate: "2026-11-01" });
    const statuses = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
    const people = [g.leader.id, g.member.id, g.member2.id, null];
    await prisma.project.update({ where: { id: g.project.id }, data: { taskKey: "FT", nextTaskNumber: 101 } });
    // Bulk-seeded (100 single inserts against the remote test database would time out).
    await prisma.task.createMany({
      data: Array.from({ length: 100 }, (_, k) => {
        const i = k + 1;
        const status = statuses[i % 4]!;
        return {
          projectId: g.project.id, number: i, title: `Realistic task title number ${i} for the sprint`,
          description: "A short description of the work that this task covers, as a student might write it.",
          createdByUserId: g.leader.id, assignedToUserId: people[i % 4], status, done: status === "DONE",
          priority: (["LOW", "MEDIUM", "HIGH"] as const)[i % 3]!, dueDate: new Date("2026-11-05T00:00:00Z"),
          position: i * 1024, milestoneId: m.body.id,
        };
      }),
    });
    const seeded = await prisma.task.findMany({ where: { projectId: g.project.id }, select: { id: true, number: true } });
    await prisma.taskLabelLink.createMany({ data: seeded.map((t) => ({ taskId: t.id, labelId: labels[t.number % 4]! })) });
    const res = await request(app).get(base(g.project.id)).set("Authorization", as(g.leader));
    const bytes = Buffer.byteLength(res.text);
    console.log(`[payload] 100-task board JSON: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB)`);
    expect(res.body.tasks).toHaveLength(100);
    expect(bytes).toBeLessThan(150 * 1024);
  });
});

describe("tasks never touch scoring inputs", () => {
  it("creating, moving and deleting tasks does not touch the project's analysis markers or reports", async () => {
    const g = await setupGroup();
    const before = await prisma.project.findUnique({ where: { id: g.project.id } });
    const t = await createTask(g.leader, g.project.id, { title: "T", assignedToUserId: g.member.id });
    await move(g.leader, g.project.id, t, { status: "DONE" });
    await request(app).delete(`${base(g.project.id)}/${t.id}`).set("Authorization", as(g.leader));
    const after = await prisma.project.findUnique({ where: { id: g.project.id } });
    expect(after!.scoringConfigChangedAt).toEqual(before!.scoringConfigChangedAt);
    expect(after!.membershipChangedAt).toEqual(before!.membershipChangedAt);
    expect(await prisma.report.count({ where: { projectId: g.project.id } })).toBe(0);
  });
});

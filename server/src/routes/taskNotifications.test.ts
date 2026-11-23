import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "../../test/factories.js";
import { prisma } from "../lib/prisma.js";
import { createApp } from "../app.js";
import { parseDateOnly } from "../lib/taskBoard.js";
import { addDaysIso, classifyDue, lazySweepIdle, runTaskDueSweep, setLazySweepEnabled, triggerLazyDueSweep } from "../lib/taskDueSweep.js";

// Phase 6: "moved to In review" tells the leader; due-tomorrow and overdue reminders go to the assignee,
// once per (task, person, kind, due date). Days are Manila calendar days.

const app = createApp();
type U = Awaited<ReturnType<typeof createUser>>["user"];
const as = (u: U) => authHeaderFor(u);

// Oct 18 2026 12:00 Manila = 04:00 UTC. Today (Manila) = 2026-10-18.
const NOW = new Date("2026-10-18T04:00:00.000Z");
const TODAY = "2026-10-18";

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const assignment = await createAssignment(cls.id);
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group Alpha" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Leader Lee" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Cruz" });
  const { user: ana } = await createUser({ systemRole: "STUDENT", name: "Ana Reyes" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id, "MEMBER");
  await createMembership(ana.id, project.id, "MEMBER");
  await prisma.project.update({ where: { id: project.id }, data: { taskKey: "FT", nextTaskNumber: 100 } });
  return { instructor, project, leader, ben, ana };
}

let counter = 0;
async function mkTask(
  projectId: number, createdBy: number,
  over: { assignedToUserId?: number | null; dueDate?: string | null; status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE"; title?: string } = {},
) {
  counter += 1;
  return prisma.task.create({
    data: {
      projectId, number: counter, title: over.title ?? `Task ${counter}`, createdByUserId: createdBy, position: counter * 1024,
      assignedToUserId: over.assignedToUserId ?? null,
      dueDate: over.dueDate ? parseDateOnly(over.dueDate) : null,
      status: over.status ?? "TODO", done: over.status === "DONE",
    },
  });
}
beforeEach(() => { counter = 0; });

const alertsOf = (userId: number, type: string) =>
  prisma.alert.findMany({ where: { recipientId: userId, type: type as never }, orderBy: { id: "asc" } });

describe("classifyDue (pure date logic)", () => {
  it("due tomorrow, overdue, or nothing", () => {
    expect(classifyDue("2026-10-19", TODAY)).toBe("DUE_SOON");
    expect(classifyDue("2026-10-17", TODAY)).toBe("OVERDUE");
    expect(classifyDue("2026-01-01", TODAY)).toBe("OVERDUE");
    expect(classifyDue("2026-10-18", TODAY)).toBeNull(); // due today: not overdue yet
    expect(classifyDue("2026-10-20", TODAY)).toBeNull();
    expect(classifyDue(null, TODAY)).toBeNull();
  });
  it("adds days without any time zone effect, across month and year ends", () => {
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("moved to In review tells the leader", () => {
  const move = (u: U, projectId: number, task: { id: number; version: number }, status: string) =>
    request(app).post(`/api/groups/${projectId}/tasks/${task.id}/move`).set("Authorization", as(u)).send({ status, expectedVersion: task.version });

  it("always notifies the leader (watching or not) with its own alert, never the actor, and the leader is not also sent a plain status change", async () => {
    const { project, leader, ben, ana } = await setup();
    const t = await mkTask(project.id, leader.id, { assignedToUserId: ben.id });
    await prisma.taskWatcher.createMany({ data: [{ taskId: t.id, userId: leader.id }, { taskId: t.id, userId: ana.id }], skipDuplicates: true });

    const res = await move(ben, project.id, t, "IN_REVIEW");
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const forLeader = await alertsOf(leader.id, "TASK_IN_REVIEW");
    expect(forLeader).toHaveLength(1);
    expect(forLeader[0]!.message).toMatch(/Ben Cruz moved ".*" to In review/);
    expect(forLeader[0]!.link).toBe(`/student/group/${project.id}?tab=tasks&task=${t.id}`);
    expect(await alertsOf(leader.id, "TASK_STATUS_CHANGED")).toHaveLength(0);
    // Other watchers still get the plain status change; the actor gets nothing.
    expect(await alertsOf(ana.id, "TASK_STATUS_CHANGED")).toHaveLength(1);
    expect(await alertsOf(ana.id, "TASK_IN_REVIEW")).toHaveLength(0);
    expect(await alertsOf(ben.id, "TASK_IN_REVIEW")).toHaveLength(0);
    expect(await alertsOf(ben.id, "TASK_STATUS_CHANGED")).toHaveLength(0);
  });

  it("a leader moving a task to In review is not told about their own action", async () => {
    const { project, leader, ben } = await setup();
    const t = await mkTask(project.id, leader.id, { assignedToUserId: ben.id });
    expect((await move(leader, project.id, t, "IN_REVIEW")).status).toBe(200);
    expect(await alertsOf(leader.id, "TASK_IN_REVIEW")).toHaveLength(0);
    expect(await prisma.alert.count({ where: { type: "TASK_IN_REVIEW" } })).toBe(0);
  });

  it("collapses repeat moves of the same task into one unread alert, and other statuses send no In review alert", async () => {
    const { project, leader, ben } = await setup();
    const t = await mkTask(project.id, leader.id, { assignedToUserId: ben.id });
    let current = t;
    for (const status of ["IN_REVIEW", "IN_PROGRESS", "IN_REVIEW"]) {
      const r = await move(ben, project.id, current, status);
      expect(r.status).toBe(200);
      current = r.body;
    }
    expect(await alertsOf(leader.id, "TASK_IN_REVIEW")).toHaveLength(1);
    const other = await mkTask(project.id, leader.id, { assignedToUserId: ben.id });
    const started = await move(ben, project.id, other, "IN_PROGRESS");
    expect(started.status).toBe(200);
    expect(await alertsOf(leader.id, "TASK_IN_REVIEW")).toHaveLength(1);
    // A different task is its own alert.
    expect((await move(ben, project.id, started.body, "IN_REVIEW")).status).toBe(200);
    expect(await alertsOf(leader.id, "TASK_IN_REVIEW")).toHaveLength(2);
  });

  it("bulk move to In review by the leader notifies assignees who watch, and the leader (the actor) nothing", async () => {
    const { project, leader, ben } = await setup();
    const t = await mkTask(project.id, leader.id, { assignedToUserId: ben.id });
    await prisma.taskWatcher.createMany({ data: [{ taskId: t.id, userId: ben.id }], skipDuplicates: true });
    const res = await request(app).post(`/api/groups/${project.id}/tasks/bulk`).set("Authorization", as(leader))
      .send({ taskIds: [t.id], action: { type: "status", status: "IN_REVIEW" } });
    expect(res.status).toBe(200);
    expect(await alertsOf(leader.id, "TASK_IN_REVIEW")).toHaveLength(0);
    expect(await alertsOf(ben.id, "TASK_STATUS_CHANGED")).toHaveLength(1);
  });
});

describe("runTaskDueSweep", () => {
  it("tells the assignee about tasks due tomorrow and overdue, and nobody else", async () => {
    const { project, leader, ben, ana } = await setup();
    const soon = await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-19", title: "Soon one" });
    const late = await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-15", title: "Late one" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: TODAY, title: "Due today" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-25", title: "Next week" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, title: "No date" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-10", status: "DONE", title: "Finished" });
    await mkTask(project.id, leader.id, { dueDate: "2026-10-10", title: "Unassigned" });

    const result = await runTaskDueSweep(NOW);
    expect(result).toMatchObject({ dueSoon: 1, overdue: 1 });

    const dueSoon = await alertsOf(ben.id, "TASK_DUE_SOON");
    expect(dueSoon).toHaveLength(1);
    expect(dueSoon[0]).toMatchObject({ refType: "TASK", refId: soon.id, projectId: project.id, read: false });
    expect(dueSoon[0]!.message).toBe(`FT-${soon.number} "Soon one" is due tomorrow`);
    expect(dueSoon[0]!.link).toBe(`/student/group/${project.id}?tab=tasks&task=${soon.id}`);
    const overdue = await alertsOf(ben.id, "TASK_OVERDUE");
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.refId).toBe(late.id);
    expect(overdue[0]!.message).toBe(`FT-${late.number} "Late one" is overdue (was due Oct 15)`);
    expect(await prisma.alert.count({ where: { recipientId: { in: [leader.id, ana.id] } } })).toBe(0);
    expect(await prisma.taskNotificationLog.count()).toBe(2);
  });

  it("never sends the same reminder twice, however often it runs, even run at once", async () => {
    const { project, leader, ben } = await setup();
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-19" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-15" });
    await Promise.all([runTaskDueSweep(NOW), runTaskDueSweep(NOW)]);
    await runTaskDueSweep(NOW);
    await runTaskDueSweep(new Date("2026-10-18T09:00:00.000Z"));
    expect(await prisma.alert.count({ where: { recipientId: ben.id } })).toBe(2);
    expect(await prisma.taskNotificationLog.count()).toBe(2);
  });

  it("a changed due date can be announced again (new date, new row), the same date cannot", async () => {
    const { project, leader, ben } = await setup();
    const t = await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-15" });
    await runTaskDueSweep(NOW);
    await prisma.alert.updateMany({ where: { recipientId: ben.id }, data: { read: true } });

    await prisma.task.update({ where: { id: t.id }, data: { dueDate: parseDateOnly("2026-10-16") } });
    await runTaskDueSweep(NOW);
    expect(await prisma.taskNotificationLog.count()).toBe(2);
    expect(await alertsOf(ben.id, "TASK_OVERDUE")).toHaveLength(2);

    // Back to a date already announced: nothing new.
    await prisma.task.update({ where: { id: t.id }, data: { dueDate: parseDateOnly("2026-10-15") } });
    await runTaskDueSweep(NOW);
    expect(await prisma.taskNotificationLog.count()).toBe(2);
    expect(await alertsOf(ben.id, "TASK_OVERDUE")).toHaveLength(2);
  });

  it("tomorrow and overdue are separate reminders: a task that slips from one to the other is announced as both", async () => {
    const { project, leader, ben } = await setup();
    const t = await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-19" });
    await runTaskDueSweep(NOW);
    // Later it is overdue: a different kind, so it gets its own alert; the earlier one stays as it was.
    await prisma.task.update({ where: { id: t.id }, data: { dueDate: parseDateOnly("2026-10-17") } });
    await runTaskDueSweep(NOW);
    expect(await alertsOf(ben.id, "TASK_DUE_SOON")).toHaveLength(1);
    expect(await alertsOf(ben.id, "TASK_OVERDUE")).toHaveLength(1);
  });

  it("skips an assignee who is no longer a member of the group", async () => {
    const { project, leader, ben } = await setup();
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-15" });
    await prisma.groupMembership.deleteMany({ where: { userId: ben.id, projectId: project.id } });
    expect(await runTaskDueSweep(NOW)).toMatchObject({ checked: 0 });
    expect(await prisma.alert.count()).toBe(0);
    expect(await prisma.taskNotificationLog.count()).toBe(0);
  });

  it("uses Manila days: 00:30 on Oct 19 in Manila is still Oct 18 in UTC", async () => {
    const { project, leader, ben } = await setup();
    const justPast = new Date("2026-10-18T16:30:00.000Z"); // Oct 19 00:30 Manila
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-20", title: "Due the 20th" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-19", title: "Due the 19th" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-18", title: "Due the 18th" });
    await runTaskDueSweep(justPast);
    const soon = await alertsOf(ben.id, "TASK_DUE_SOON");
    const late = await alertsOf(ben.id, "TASK_OVERDUE");
    expect(soon.map((a) => a.message)).toEqual([expect.stringContaining("Due the 20th")]); // tomorrow in Manila
    expect(late.map((a) => a.message)).toEqual([expect.stringContaining("Due the 18th")]); // the 19th itself is "today"
  });

  it("can be limited to one group", async () => {
    const a = await setup();
    const b = await setup();
    await mkTask(a.project.id, a.leader.id, { assignedToUserId: a.ben.id, dueDate: "2026-10-15" });
    await mkTask(b.project.id, b.leader.id, { assignedToUserId: b.ben.id, dueDate: "2026-10-15" });
    await runTaskDueSweep(NOW, { projectId: a.project.id });
    expect(await alertsOf(a.ben.id, "TASK_OVERDUE")).toHaveLength(1);
    expect(await alertsOf(b.ben.id, "TASK_OVERDUE")).toHaveLength(0);
  });

  it("deleting a task removes its reminder log", async () => {
    const { project, leader, ben } = await setup();
    const t = await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-15" });
    await runTaskDueSweep(NOW);
    expect(await prisma.taskNotificationLog.count()).toBe(1);
    await prisma.task.delete({ where: { id: t.id } });
    expect(await prisma.taskNotificationLog.count()).toBe(0);
  });

  it("creates no Report or scoring data", async () => {
    const { project, leader, ben } = await setup();
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: "2026-10-15" });
    await runTaskDueSweep(NOW);
    expect(await prisma.report.count()).toBe(0);
    expect(await prisma.editEvent.count()).toBe(0);
  });
});

describe("the lazy sweep on board reads", () => {
  beforeEach(() => setLazySweepEnabled(true));
  afterEach(() => setLazySweepEnabled(false));

  it("a board read starts a sweep for that group; the read itself never waits for it or fails", async () => {
    const { project, leader, ben } = await setup();
    // Due dates relative to the real clock, since the route uses "now".
    const past = addDaysIso(new Date().toISOString().slice(0, 10), -3);
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: past });
    const res = await request(app).get(`/api/groups/${project.id}/tasks`).set("Authorization", as(ben));
    expect(res.status).toBe(200);
    await lazySweepIdle();
    expect(await alertsOf(ben.id, "TASK_OVERDUE")).toHaveLength(1);
  });

  it("runs at most once per 10 minutes per group", async () => {
    const { project } = await setup();
    expect(triggerLazyDueSweep(project.id, new Date("2026-10-18T04:00:00Z"))).toBe(true);
    await lazySweepIdle();
    expect(triggerLazyDueSweep(project.id, new Date("2026-10-18T04:05:00Z"))).toBe(false);
    expect(triggerLazyDueSweep(project.id + 1, new Date("2026-10-18T04:05:00Z"))).toBe(true);
    await lazySweepIdle();
    expect(triggerLazyDueSweep(project.id, new Date("2026-10-18T04:10:01Z"))).toBe(true);
    await lazySweepIdle();
  });

  it("is off unless switched on (so other tests are never touched by a background sweep)", async () => {
    setLazySweepEnabled(false);
    expect(triggerLazyDueSweep(1)).toBe(false);
  });
});

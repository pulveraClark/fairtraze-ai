import { describe, it, expect } from "vitest";
import request from "supertest";
import type { AssignmentTaskSummary, WorkloadResponse } from "@shared/taskTypes.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "../../test/factories.js";
import { prisma } from "../lib/prisma.js";
import { createApp } from "../app.js";
import { parseDateOnly, manilaToday } from "../lib/taskBoard.js";

// Phase 7: the leader's Workload panel and the class page's task cards. Read-only counts.

const app = createApp();
type U = Awaited<ReturnType<typeof createUser>>["user"];
const as = (u: U) => authHeaderFor(u);

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const assignment = await createAssignment(cls.id);
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group Alpha" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Leader Lee" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Ben Cruz" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
  await createClassSection(otherInstructor.id);
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id, "MEMBER");
  return { instructor, assignment, project, leader, ben, outsider, admin, otherInstructor };
}

let n = 0;
async function mkTask(projectId: number, createdBy: number, over: { assignedToUserId?: number; dueDate?: string; status?: "TODO" | "IN_REVIEW" | "DONE"; milestoneId?: number } = {}) {
  n += 1;
  return prisma.task.create({
    data: {
      projectId, number: n, title: `T${n}`, createdByUserId: createdBy, position: n * 1024,
      assignedToUserId: over.assignedToUserId ?? null,
      dueDate: over.dueDate ? parseDateOnly(over.dueDate) : null,
      status: over.status ?? "TODO", done: over.status === "DONE",
      milestoneId: over.milestoneId ?? null,
    },
  });
}

const workload = (u: U, projectId: number) => request(app).get(`/api/groups/${projectId}/tasks/workload`).set("Authorization", as(u));
const summary = (u: U, assignmentId: number | string) => request(app).get(`/api/assignments/${assignmentId}/task-summary`).set("Authorization", as(u));

describe("GET /api/groups/:id/tasks/workload", () => {
  it("is for the leader, the class's instructor and admins only", async () => {
    const { project, leader, ben, instructor, admin, outsider, otherInstructor } = await setup();
    for (const u of [leader, instructor, admin]) expect((await workload(u, project.id)).status).toBe(200);
    expect((await workload(ben, project.id)).status).toBe(403);
    expect((await workload(outsider, project.id)).status).toBe(403);
    expect((await workload(otherInstructor, project.id)).status).toBe(403);
    expect((await request(app).get(`/api/groups/${project.id}/tasks/workload`)).status).toBe(401);
    expect((await workload(leader, 999999)).status).toBe(404);
  });

  it("counts each member's open, overdue, due-this-week, in-review and done tasks", async () => {
    const { project, leader, ben } = await setup();
    const today = manilaToday();
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, dueDate: addDays(today, -2) });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, status: "IN_REVIEW" });
    await mkTask(project.id, leader.id, { assignedToUserId: ben.id, status: "DONE", dueDate: addDays(today, -9) });
    await mkTask(project.id, leader.id, { dueDate: addDays(today, -1) });
    const res = await workload(leader, project.id);
    const body = res.body as WorkloadResponse;
    expect(body).toMatchObject({ groupId: project.id, today });
    expect(body.members[0]).toEqual({ userId: ben.id, name: "Ben Cruz", open: 2, overdue: 1, dueThisWeek: 0, inReview: 1, done: 1 });
    expect(body.members[1]).toMatchObject({ name: "Leader Lee", open: 0 });
    expect(body.unassigned).toEqual({ open: 1, overdue: 1 });
  });

  it("works for an assignment-less group for the leader and admins, never for another instructor", async () => {
    const { user: leader } = await createUser({ systemRole: "STUDENT" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: someInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const project = await createProject({ assignmentId: null });
    await createMembership(leader.id, project.id, "LEADER");
    expect((await workload(leader, project.id)).status).toBe(200);
    expect((await workload(admin, project.id)).status).toBe(200);
    expect((await workload(someInstructor, project.id)).status).toBe(403);
  });

  it("writes nothing and creates no scoring data", async () => {
    const { project, leader } = await setup();
    await mkTask(project.id, leader.id);
    const before = await prisma.taskActivity.count();
    await workload(leader, project.id);
    expect(await prisma.taskActivity.count()).toBe(before);
    expect(await prisma.report.count()).toBe(0);
    expect(await prisma.alert.count()).toBe(0);
  });
});

describe("GET /api/assignments/:id/task-summary", () => {
  it("lists each group of the assignment with totals, overdue and milestone progress", async () => {
    const { assignment, project, leader, instructor } = await setup();
    const today = manilaToday();
    const second = await createProject({ assignmentId: assignment.id, groupName: "Group Beta" });
    const ms = await prisma.taskMilestone.create({ data: { projectId: project.id, name: "Alpha release", dueDate: parseDateOnly(addDays(today, 20)), position: 1 } });
    await mkTask(project.id, leader.id, { milestoneId: ms.id, status: "DONE" });
    await mkTask(project.id, leader.id, { milestoneId: ms.id, dueDate: addDays(today, -3) });
    await mkTask(project.id, leader.id);

    const res = await summary(instructor, assignment.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = res.body as AssignmentTaskSummary;
    expect(body.assignmentId).toBe(assignment.id);
    expect(body.groups.map((g) => g.groupName)).toEqual(["Group Alpha", "Group Beta"]);
    expect(body.groups[0]).toMatchObject({ projectId: project.id, total: 3, done: 1, overdue: 1 });
    expect(body.groups[0]!.milestones).toEqual([{ id: ms.id, name: "Alpha release", dueDate: addDays(today, 20), total: 2, done: 1 }]);
    expect(body.groups[1]).toMatchObject({ projectId: second.id, total: 0, done: 0, overdue: 0, milestones: [] });
  });

  it("does not include groups of other assignments", async () => {
    const { assignment, instructor } = await setup();
    const other = await setup();
    const res = await summary(instructor, assignment.id);
    expect((res.body as AssignmentTaskSummary).groups).toHaveLength(1);
    expect((res.body as AssignmentTaskSummary).groups[0]!.projectId).not.toBe(other.project.id);
  });

  it("only the instructor who owns the class (and admins) may read it", async () => {
    const { assignment, instructor, admin, otherInstructor, leader, ben } = await setup();
    expect((await summary(instructor, assignment.id)).status).toBe(200);
    expect((await summary(admin, assignment.id)).status).toBe(200);
    expect((await summary(otherInstructor, assignment.id)).status).toBe(403);
    expect((await summary(leader, assignment.id)).status).toBe(403);
    expect((await summary(ben, assignment.id)).status).toBe(403);
    expect((await request(app).get(`/api/assignments/${assignment.id}/task-summary`)).status).toBe(401);
  });

  it("404 for a missing assignment and 400 for a bad id", async () => {
    const { instructor } = await setup();
    expect((await summary(instructor, 999999)).status).toBe(404);
    expect((await summary(instructor, "abc")).status).toBe(400);
  });
});

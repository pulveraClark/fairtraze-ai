import { beforeEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { clearAssigneeHintsCache } from "../src/lib/taskAssigneeHints.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

vi.hoisted(() => { process.env.REQUEST_TIMING_LOG = "on"; });

// Characterisation test for GET /api/groups/:id/tasks (the board). The full payload is pinned (snapshot written from
// the code BEFORE the E1-4 change) for a member, the leader and the owning instructor; the order of the checks is
// pinned too. Ids and times are replaced by tokens so the snapshot is stable.

const app = createApp();
beforeEach(() => clearAssigneeHintsCache());

const TOKEN_KEYS = new Set(["id", "userId", "groupId", "assignedToUserId", "createdByUserId", "milestoneId", "createdAt", "updatedAt", "completedAt", "avatarUpdatedAt"]);
function norm(v: unknown, key?: string): unknown {
  if (Array.isArray(v)) return key === "labelIds" ? v.map(() => "<labelId>") : v.map((x) => norm(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, norm(x, k)]));
  if (key && TOKEN_KEYS.has(key) && v !== null) return `<${key}>`;
  return v;
}

async function seed() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "COMBINED" });
  const project = await createProject({ assignmentId: asg.id, groupName: "Group Board" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lead" });
  const { user: member } = await createUser({ systemRole: "STUDENT", name: "Mem" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT", name: "Out" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");

  const ms = await prisma.taskMilestone.create({ data: { projectId: project.id, name: "M1", position: 1024 } });
  const label = await prisma.taskLabel.create({ data: { projectId: project.id, name: "Documentation", color: "blue" } });
  await prisma.taskKeyAlias.create({ data: { projectId: project.id, key: "OLD" } });
  const t1 = await prisma.task.create({ data: { projectId: project.id, number: 1, title: "T1", createdByUserId: leader.id, assignedToUserId: member.id, position: 1024, milestoneId: ms.id } });
  const t2 = await prisma.task.create({ data: { projectId: project.id, number: 2, title: "T2", createdByUserId: leader.id, status: "DONE", done: true, position: 2048 } });
  await prisma.task.create({ data: { projectId: project.id, number: 3, title: "T3 no extras", createdByUserId: member.id, position: 3072 } });
  await prisma.taskLabelLink.create({ data: { taskId: t1.id, labelId: label.id } });
  await prisma.taskSubtask.createMany({ data: [
    { taskId: t1.id, title: "a", done: true, position: 1 }, { taskId: t1.id, title: "b", done: false, position: 2 },
    { taskId: t1.id, title: "c", done: false, position: 3 }, { taskId: t2.id, title: "d", done: true, position: 1 },
  ] });
  await prisma.taskCommitLink.createMany({ data: [
    { taskId: t1.id, repo: "o/r", sha: "a".repeat(40), message: "OLD-1 first", committedAt: new Date("2026-11-01T00:00:00Z") },
    { taskId: t1.id, repo: "o/r", sha: "b".repeat(40), message: "OLD-1 second", committedAt: new Date("2026-11-02T00:00:00Z") },
    { taskId: t2.id, repo: "o/r", sha: "c".repeat(40), message: "OLD-2", committedAt: new Date("2026-11-03T00:00:00Z") },
  ] });
  // A saved report so the leader's assignee hints have shares and an overload flag.
  await prisma.report.create({ data: { projectId: project.id, gini: 0.4, teamHealth: "High Risk", generatedAt: new Date("2026-11-12T00:00:00Z"),
    content: JSON.stringify({ report: { gini: 0.4, teamHealth: "High Risk", memberCount: 2, members: [
      { studentName: "Lead", userId: leader.id, contributionShare: 0.7, flags: ["overload"] },
      { studentName: "Mem", userId: member.id, contributionShare: 0.3, flags: [] },
    ] } }) } });
  return { instructor, project, leader, member, outsider };
}

const board = (id: number | string, u?: Parameters<typeof authHeaderFor>[0]) => {
  const r = request(app).get(`/api/groups/${id}/tasks`);
  return u ? r.set("Authorization", authHeaderFor(u)) : r;
};

/** Prisma operations for one request, from the E1-0 timing line. */
async function opsFor(fn: () => Promise<unknown>): Promise<number> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((l: unknown) => { lines.push(String(l)); });
  try { await fn(); await new Promise((r) => setTimeout(r, 30)); } finally { spy.mockRestore(); }
  const m = lines.find((l) => l.startsWith("[timing]"))?.match(/ q=(\d+)/);
  if (!m) throw new Error("no timing line");
  return Number(m[1]);
}

describe("GET /api/groups/:id/tasks: payload is unchanged", () => {
  it("member", async () => {
    const { project, member } = await seed();
    const res = await board(project.id, member);
    expect(res.status).toBe(200);
    expect(res.body.assigneeHints).toBeUndefined();
    expect(res.body.tasks.find((t: { title: string }) => t.title === "T1")).toMatchObject({ subtasks: { done: 1, total: 3 }, commitCount: 2 });
    expect(norm(res.body)).toMatchSnapshot();
  });

  it("leader (assignee hints included)", async () => {
    const { project, leader } = await seed();
    const res = await board(project.id, leader);
    expect(res.status).toBe(200);
    expect(res.body.assigneeHints).toHaveLength(2);
    expect(norm(res.body)).toMatchSnapshot();
  });

  it("owning instructor (read-only view)", async () => {
    const { project, instructor } = await seed();
    const res = await board(project.id, instructor);
    expect(res.status).toBe(200);
    expect(res.body.viewer.readOnly).toBe(true);
    expect(norm(res.body)).toMatchSnapshot();
  });

  it("a poll with the ETag it was given answers 304", async () => {
    const { project, member } = await seed();
    const first = await board(project.id, member);
    const second = await board(project.id, member).set("If-None-Match", first.headers.etag);
    expect(second.status).toBe(304);
  });

  it("a group with no tasks still answers an empty board", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cls = await createClassSection(instructor.id);
    const asg = await createAssignment(cls.id, { sourceType: "GITHUB" });
    const project = await createProject({ assignmentId: asg.id });
    const { user } = await createUser({ systemRole: "STUDENT" });
    await createMembership(user.id, project.id, "MEMBER");
    const res = await board(project.id, user);
    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([]);
  });
});

describe("GET /api/groups/:id/tasks: order of the checks", () => {
  const NO_AUTH = { error: "Authentication required" };
  const expiredToken = () => jwt.sign({ sub: 1, email: "x@y.z", name: "X", role: "STUDENT" }, process.env.AUTH_SECRET as string, { expiresIn: -60 });

  it("no token: 401 even for a bad id", async () => {
    const a = await board(1);
    expect(a.status).toBe(401);
    expect(a.body).toEqual(NO_AUTH);
    const b = await board("abc");
    expect(b.status).toBe(401);
    expect(b.body).toEqual(NO_AUTH);
  });

  it("invalid and expired tokens: the same 401, before any id or group check", async () => {
    for (const token of ["not-a-token", expiredToken()]) {
      for (const id of ["1", "abc", "999999999"]) {
        const res = await request(app).get(`/api/groups/${id}/tasks`).set("Authorization", `Bearer ${token}`);
        expect(res.status, `${id}`).toBe(401);
        expect(res.body).toEqual(NO_AUTH);
      }
    }
  });

  it("deactivated user: 401 ACCOUNT_UNAVAILABLE on the very next request, whatever the id", async () => {
    const { project, member } = await seed();
    const auth = authHeaderFor(member);
    expect((await request(app).get(`/api/groups/${project.id}/tasks`).set("Authorization", auth)).status).toBe(200);
    await prisma.user.update({ where: { id: member.id }, data: { active: false } });
    for (const id of [String(project.id), "abc", "999999999"]) {
      const res = await request(app).get(`/api/groups/${id}/tasks`).set("Authorization", auth);
      expect(res.status, id).toBe(401);
      expect(res.body).toEqual({ error: "Account no longer available", code: "ACCOUNT_UNAVAILABLE" });
    }
    await prisma.user.update({ where: { id: member.id }, data: { active: true } });
    expect((await request(app).get(`/api/groups/${project.id}/tasks`).set("Authorization", auth)).status).toBe(200);
  });

  it("erased account: 401 ACCOUNT_UNAVAILABLE", async () => {
    const { project, member } = await seed();
    await prisma.user.update({ where: { id: member.id }, data: { deletedAt: new Date() } });
    const res = await board(project.id, member);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_UNAVAILABLE");
  });

  it("400 for a bad id, 404 for an unknown group, 403 for someone outside the group", async () => {
    const { project, member, outsider } = await seed();
    const bad = await board("abc", member);
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: "Invalid group id" });
    const none = await board(999999999, member);
    expect(none.status).toBe(404);
    expect(none.body).toEqual({ error: "Group not found." });
    const out = await board(project.id, outsider);
    expect(out.status).toBe(403);
    expect(out.body).toEqual({ error: "You do not have access to this group." });
  });

  it("403 for an instructor who does not own the class", async () => {
    const { project } = await seed();
    const { user: stranger } = await createUser({ systemRole: "INSTRUCTOR" });
    const res = await board(project.id, stranger);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "You do not have access to this group." });
  });
});

describe("GET /api/groups/:id/tasks: Prisma operations (q= in the timing log)", () => {
  it("member", async () => {
    const { project, member } = await seed();
    expect(await opsFor(() => board(project.id, member))).toBe(Q.member);
  });
  it("leader, hints cache cold", async () => {
    const { project, leader } = await seed();
    expect(await opsFor(() => board(project.id, leader))).toBe(Q.leaderCold);
  });
  it("leader, hints cache warm (second poll)", async () => {
    const { project, leader } = await seed();
    await board(project.id, leader);
    expect(await opsFor(() => board(project.id, leader))).toBe(Q.leaderWarm);
  });
});

const Q = { member: 8, leaderCold: 10, leaderWarm: 9 }; // unchanged by E1-4: the same operations, in 2 stages instead of 4

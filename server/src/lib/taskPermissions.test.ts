import { describe, it, expect } from "vitest";
import {
  canAssignTask, canCreateTask, canDeleteTask, canEditTask, canManageBoard, canMoveTask, canSetDueDate,
  canViewBoard, permissionsFor, type TaskActor,
} from "./taskPermissions.js";

// One test per rule of the Tasks permission model. The HTTP-level tests (routes/tasks.test.ts)
// prove the routes call this helper; these pin the rules themselves.

const actor = (over: Partial<TaskActor>): TaskActor => ({
  userId: 10, isAdmin: false, isMember: false, isLeader: false, isOwningInstructor: false, ...over,
});
const leader = actor({ userId: 1, isMember: true, isLeader: true });
const assignee = actor({ userId: 2, isMember: true });
const otherMember = actor({ userId: 3, isMember: true });
const instructor = actor({ userId: 4, isOwningInstructor: true });
const admin = actor({ userId: 5, isAdmin: true });
const outsider = actor({ userId: 6 });

const mine = { assignedToUserId: 2, status: "TODO" as const };
const unassigned = { assignedToUserId: null, status: "TODO" as const };
const done = { assignedToUserId: 2, status: "DONE" as const };

describe("viewing and creating", () => {
  it("members, the owning instructor and admins can view; outsiders cannot", () => {
    expect([leader, assignee, instructor, admin].every(canViewBoard)).toBe(true);
    expect(canViewBoard(outsider)).toBe(false);
  });
  it("any member can create a task; instructor, admin and outsiders cannot", () => {
    expect([leader, assignee, otherMember].every(canCreateTask)).toBe(true);
    expect([instructor, admin, outsider].some(canCreateTask)).toBe(false);
  });
});

describe("leader rights", () => {
  it("leader can edit, assign, delete, set due date and manage the board", () => {
    expect(canEditTask(leader, mine)).toBe(true);
    expect(canEditTask(leader, done)).toBe(true);
    expect(canSetDueDate(leader, unassigned)).toBe(true);
    expect(canAssignTask(leader)).toBe(true);
    expect(canDeleteTask(leader)).toBe(true);
    expect(canManageBoard(leader)).toBe(true);
  });
  it("leader can move any task anywhere, including into and out of Done", () => {
    for (const task of [mine, unassigned, done]) {
      for (const to of ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
        expect(canMoveTask(leader, task, to)).toEqual({ ok: true });
      }
    }
  });
});

describe("assigned member", () => {
  it("can edit and set the due date of their own task until it is Done", () => {
    expect(canEditTask(assignee, mine)).toBe(true);
    expect(canSetDueDate(assignee, mine)).toBe(true);
    expect(canEditTask(assignee, done)).toBe(false);
  });
  it("cannot assign, delete or manage the board", () => {
    expect(canAssignTask(assignee)).toBe(false);
    expect(canDeleteTask(assignee)).toBe(false);
    expect(canManageBoard(assignee)).toBe(false);
  });
  it("can move own task among To do, In progress and In review", () => {
    for (const to of ["TODO", "IN_PROGRESS", "IN_REVIEW"] as const) {
      expect(canMoveTask(assignee, mine, to)).toEqual({ ok: true });
    }
  });
  it("cannot move own task into Done", () => {
    expect(canMoveTask(assignee, mine, "DONE")).toMatchObject({ ok: false });
  });
  it("cannot move own task out of Done", () => {
    expect(canMoveTask(assignee, done, "IN_REVIEW")).toMatchObject({ ok: false });
    expect(canMoveTask(assignee, done, "DONE")).toMatchObject({ ok: false });
  });
});

describe("other members", () => {
  it("cannot edit, set a due date on or move someone else's task", () => {
    expect(canEditTask(otherMember, mine)).toBe(false);
    expect(canSetDueDate(otherMember, mine)).toBe(false);
    expect(canMoveTask(otherMember, mine, "IN_PROGRESS")).toMatchObject({ ok: false });
  });
  it("cannot move or edit an unassigned task (leader only)", () => {
    expect(canMoveTask(otherMember, unassigned, "IN_PROGRESS")).toMatchObject({ ok: false });
    expect(canEditTask(otherMember, unassigned)).toBe(false);
  });
});

describe("instructor, admin and outsiders", () => {
  it("are view only: no move, edit, assign, delete or board management", () => {
    for (const a of [instructor, admin, outsider]) {
      expect(canMoveTask(a, mine, "IN_PROGRESS")).toMatchObject({ ok: false });
      expect(canEditTask(a, mine)).toBe(false);
      expect(canSetDueDate(a, mine)).toBe(false);
      expect(canAssignTask(a)).toBe(false);
      expect(canDeleteTask(a)).toBe(false);
      expect(canManageBoard(a)).toBe(false);
    }
  });
});

describe("permissionsFor (what the UI mirrors)", () => {
  it("gives the assignee no Done column and the leader all four", () => {
    expect(permissionsFor(assignee, mine).allowedStatuses).toEqual(["TODO", "IN_PROGRESS", "IN_REVIEW"]);
    expect(permissionsFor(leader, mine).allowedStatuses).toEqual(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
  });
  it("shows no grip (move=false) when no column is allowed", () => {
    expect(permissionsFor(otherMember, mine).move).toBe(false);
    expect(permissionsFor(instructor, mine)).toMatchObject({ move: false, edit: false, delete: false, assign: false });
    expect(permissionsFor(assignee, done).move).toBe(false);
  });
  it("explains a refusal in plain words that name the leader", () => {
    const d = canMoveTask(otherMember, mine, "IN_PROGRESS");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.message).toMatch(/leader/);
  });
});

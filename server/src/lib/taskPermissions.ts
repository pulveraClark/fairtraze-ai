import type { TaskPermissions, TaskStatus } from "@shared/taskTypes.js";
import { TASK_STATUSES } from "@shared/taskTypes.js";
import type { LoadedGroup } from "./groupAccess.js";

// The single authorization helper for the Tasks board. Pure: every route calls it, and the same
// result is serialized onto each task (`permissions`) so the UI mirrors the server and never
// decides on its own. Tasks are planning data only; none of this touches scoring.
//
// Rules:
//  - Group leader: create, edit, assign, move any task, delete, bulk edit, manage milestones/labels.
//  - Assigned member: edit own task (until Done), move it between To do / In progress / In review,
//    change its due date.
//  - Entering or leaving Done: leader only. Unassigned tasks: only the leader can move them.
//  - Any member: create (unassigned, To do), view, comment, mention, watch.
//  - Instructor (who owns the class) and admin: view only.

export interface TaskActor {
  userId: number;
  isAdmin: boolean;
  isMember: boolean;
  isLeader: boolean;
  /** Owns the class this group's assignment belongs to. False for groups with no assignment. */
  isOwningInstructor: boolean;
}

export interface TaskLike {
  assignedToUserId: number | null;
  status: TaskStatus;
}

export type Decision = { ok: true } | { ok: false; message: string };

export function resolveTaskActor(user: { sub: number; role: string }, project: LoadedGroup): TaskActor {
  const membership = project.groupMemberships.find((m) => m.userId === user.sub);
  return {
    userId: user.sub,
    isAdmin: user.role === "ADMIN",
    isMember: !!membership,
    isLeader: membership?.role === "LEADER",
    isOwningInstructor:
      (user.role === "INSTRUCTOR" || user.role === "ADMIN") &&
      project.assignment?.classSection.instructorId === user.sub,
  };
}

export const canViewBoard = (a: TaskActor) => a.isMember || a.isOwningInstructor;
export const canCreateTask = (a: TaskActor) => a.isMember;
/** Milestones, labels, bulk edit, assigning, deleting. */
export const canManageBoard = (a: TaskActor) => a.isLeader;

const isAssignee = (a: TaskActor, t: TaskLike) => a.isMember && t.assignedToUserId === a.userId;

export function canEditTask(a: TaskActor, t: TaskLike): boolean {
  return a.isLeader || (isAssignee(a, t) && t.status !== "DONE");
}
export const canSetDueDate = canEditTask;
export const canAssignTask = (a: TaskActor) => a.isLeader;
export const canDeleteTask = (a: TaskActor) => a.isLeader;
/** Comments and watching are open to every member; instructors and admins are view-only. */
export const canCommentOnTask = (a: TaskActor) => a.isMember;
export const canWatchTask = (a: TaskActor) => a.isMember;

/** May this actor put this task into column `to`? (to === current status means reordering.) */
export function canMoveTask(a: TaskActor, t: TaskLike, to: TaskStatus): Decision {
  if (!a.isMember) return { ok: false, message: "Instructors and admins have view-only access to tasks." };
  if (a.isLeader) return { ok: true };
  if (t.assignedToUserId === null) {
    return { ok: false, message: "Only the group leader can move an unassigned task." };
  }
  if (t.assignedToUserId !== a.userId) {
    return { ok: false, message: "Only the assigned member or the group leader can move this task." };
  }
  if (t.status === "DONE") {
    return { ok: false, message: "Only the group leader can move a task out of Done." };
  }
  if (to === "DONE") {
    return { ok: false, message: "Only the group leader can mark a task Done." };
  }
  return { ok: true };
}

export function permissionsFor(a: TaskActor, t: TaskLike): TaskPermissions {
  const allowedStatuses = TASK_STATUSES.filter((s) => canMoveTask(a, t, s).ok);
  return {
    edit: canEditTask(a, t),
    setDue: canSetDueDate(a, t),
    assign: canAssignTask(a),
    delete: canDeleteTask(a),
    move: allowedStatuses.length > 0,
    comment: canCommentOnTask(a),
    watch: canWatchTask(a),
    allowedStatuses: [...allowedStatuses],
  };
}

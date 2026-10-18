import type { Prisma } from "@prisma/client";
import type {
  BoardLabel, BoardMilestone, BoardResponse, BoardTask, TaskActivityType, TaskLabelColor, TaskStatus,
} from "@shared/taskTypes.js";
import { prisma } from "./prisma.js";
import type { LoadedGroup } from "./groupAccess.js";
import {
  canCreateTask, canManageBoard, permissionsFor, type TaskActor,
} from "./taskPermissions.js";
import { effectiveTaskKey } from "./taskKey.js";

type Tx = Prisma.TransactionClient;

export type TaskRow = Prisma.TaskGetPayload<{ include: { labelLinks: true } }>;

/** The ONE place that keeps the legacy `done` flag and `completedAt` in step with `status`. */
export function statusFields(status: TaskStatus, previous?: { status: TaskStatus; completedAt: Date | null }) {
  const done = status === "DONE";
  const completedAt = done ? (previous?.status === "DONE" && previous.completedAt ? previous.completedAt : new Date()) : null;
  return { status, done, completedAt };
}

export function formatDateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** "YYYY-MM-DD" -> Date at UTC midnight (stored in a DATE column). Null for impossible dates. */
export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/** Today's calendar date in the school's time zone (Asia/Manila), as "YYYY-MM-DD". */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Warning text when a due date falls after the project deadline, else null. */
export function afterDeadlineWarning(dueDate: Date | null, deadline: Date | null | undefined): string | null {
  if (!dueDate || !deadline) return null;
  const deadlineDay = manilaToday(deadline);
  if (formatDateOnly(dueDate)! <= deadlineDay) return null;
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(deadline);
  return `This is after the project deadline (${label}).`;
}

export function serializeTask(
  task: TaskRow,
  ctx: { project: LoadedGroup; actor: TaskActor; subtasks?: { done: number; total: number }; commitCount?: number },
): BoardTask {
  const key = effectiveTaskKey(ctx.project);
  return {
    id: task.id,
    projectId: task.projectId,
    key: `${key}-${task.number}`,
    number: task.number,
    title: task.title,
    description: task.description,
    assignedToUserId: task.assignedToUserId,
    createdByUserId: task.createdByUserId,
    done: task.done,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    status: task.status,
    priority: task.priority,
    dueDate: formatDateOnly(task.dueDate),
    position: task.position,
    version: task.version,
    milestoneId: task.milestoneId,
    docHeading: task.docHeading,
    labelIds: task.labelLinks.map((l) => l.labelId).sort((a, b) => a - b),
    subtasks: ctx.subtasks ?? { done: 0, total: 0 },
    commitCount: ctx.commitCount ?? 0,
    permissions: permissionsFor(ctx.actor, task),
  };
}

/** Done/total subtasks per task id (one grouped query). */
export async function subtaskCountsFor(taskIds: number[]): Promise<Map<number, { done: number; total: number }>> {
  const map = new Map<number, { done: number; total: number }>();
  if (!taskIds.length) return map;
  const groups = await prisma.taskSubtask.groupBy({ by: ["taskId", "done"], where: { taskId: { in: taskIds } }, _count: { _all: true } });
  for (const g of groups) {
    const cur = map.get(g.taskId) ?? { done: 0, total: 0 };
    cur.total += g._count._all;
    if (g.done) cur.done += g._count._all;
    map.set(g.taskId, cur);
  }
  return map;
}

/** serializeTask for one row, filling in its subtask progress. */
export async function serializeTaskWithCounts(task: TaskRow, ctx: { project: LoadedGroup; actor: TaskActor }): Promise<BoardTask> {
  const counts = await subtaskCountsFor([task.id]);
  return serializeTask(task, { ...ctx, subtasks: counts.get(task.id) });
}

export async function loadTaskRow(taskId: number): Promise<TaskRow | null> {
  return prisma.task.findUnique({ where: { id: taskId }, include: { labelLinks: true } });
}

export async function loadBoard(project: LoadedGroup, actor: TaskActor): Promise<BoardResponse> {
  const [rows, milestones, labels] = await Promise.all([
    prisma.task.findMany({
      where: { projectId: project.id },
      include: { labelLinks: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    prisma.taskMilestone.findMany({ where: { projectId: project.id }, orderBy: [{ position: "asc" }, { id: "asc" }] }),
    prisma.taskLabel.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } }),
  ]);

  const counts = await subtaskCountsFor(rows.map((t) => t.id));
  const tasks = rows.map((t) => serializeTask(t, { project, actor, subtasks: counts.get(t.id) }));
  const boardMilestones: BoardMilestone[] = milestones.map((m) => {
    const inMs = rows.filter((t) => t.milestoneId === m.id);
    return {
      id: m.id,
      name: m.name,
      dueDate: formatDateOnly(m.dueDate),
      position: m.position,
      total: inMs.length,
      done: inMs.filter((t) => t.status === "DONE").length,
    };
  });
  const boardLabels: BoardLabel[] = labels.map((l) => ({ id: l.id, name: l.name, color: l.color as TaskLabelColor }));

  return {
    group: {
      id: project.id,
      groupName: project.groupName.trim() || `Group ${project.id}`,
      taskKey: effectiveTaskKey(project),
      deadline: project.assignment?.deadline ? project.assignment.deadline.toISOString() : null,
    },
    viewer: {
      userId: actor.userId,
      isLeader: actor.isLeader,
      isMember: actor.isMember,
      readOnly: !actor.isMember,
      canCreate: canCreateTask(actor),
      canManageBoard: canManageBoard(actor),
    },
    members: project.groupMemberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      avatarUpdatedAt: m.user.avatarUpdatedAt ? m.user.avatarUpdatedAt.toISOString() : null,
      role: m.role,
      functionalRoles: JSON.parse(m.functionalRoles) as string[],
    })),
    tasks,
    milestones: boardMilestones,
    labels: boardLabels,
  };
}

/** Position at the bottom of a column. */
export async function nextBottomPosition(tx: Tx, projectId: number, status: TaskStatus): Promise<number> {
  const last = await tx.task.findFirst({
    where: { projectId, status },
    orderBy: [{ position: "desc" }, { id: "desc" }],
    select: { position: true },
  });
  return last ? last.position + 1024 : 1024;
}

export async function logActivity(
  tx: Tx,
  entries: { taskId: number; actorId: number | null; type: TaskActivityType; data?: Prisma.InputJsonValue }[],
): Promise<void> {
  if (!entries.length) return;
  await tx.taskActivity.createMany({
    data: entries.map((e) => ({ taskId: e.taskId, actorId: e.actorId, type: e.type, data: e.data ?? undefined })),
  });
}

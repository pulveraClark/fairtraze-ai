import type { Prisma } from "@prisma/client";
import { TASK_STATUS_LABELS, type TaskStatus } from "@shared/taskTypes.js";
import { prisma } from "./prisma.js";
import { notify } from "./notify.js";
import type { LoadedGroup } from "./groupAccess.js";

// Watchers and the task-details notifications. Planning data only; nothing here touches scoring.
// Auto-watch: the creator, the assignee and anyone who comments. Members can also watch/unwatch.

type Db = Prisma.TransactionClient | typeof prisma;

export function taskLink(projectId: number, taskId: number): string {
  return `/student/group/${projectId}?tab=tasks&task=${taskId}`;
}

/** Idempotent: already-watching users are left alone. */
export async function addWatchers(db: Db, taskId: number, userIds: (number | null | undefined)[]): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is number => typeof id === "number"))];
  if (!ids.length) return;
  await db.taskWatcher.createMany({ data: ids.map((userId) => ({ taskId, userId })), skipDuplicates: true });
}

export function memberName(project: LoadedGroup, userId: number): string {
  return project.groupMemberships.find((m) => m.userId === userId)?.user.name ?? "A group member";
}

/** Watchers who are still members of the group (a removed member stops getting notifications). */
export async function currentWatcherIds(project: LoadedGroup, taskId: number): Promise<number[]> {
  const rows = await prisma.taskWatcher.findMany({ where: { taskId }, select: { userId: true } });
  const members = new Set(project.groupMemberships.map((m) => m.userId));
  return rows.map((r) => r.userId).filter((id) => members.has(id));
}

/** Status change: watchers only, never the actor, collapsed into one unread alert per task. */
export async function notifyStatusChange(
  project: LoadedGroup,
  actorId: number,
  task: { id: number; title: string },
  to: TaskStatus,
): Promise<void> {
  await notify({
    recipientIds: () => currentWatcherIds(project, task.id),
    actorId,
    type: "TASK_STATUS_CHANGED",
    message: `${memberName(project, actorId)} moved "${task.title}" to ${TASK_STATUS_LABELS[to]}`,
    link: taskLink(project.id, task.id),
    projectId: project.id,
    refType: "TASK",
    refId: task.id,
    collapse: true,
  });
}

/** @mentioned members are always notified (never the actor), whether or not they watch the task. */
export async function notifyMentions(
  project: LoadedGroup,
  actorId: number,
  task: { id: number; title: string },
  mentionedIds: number[],
  where: "comment" | "description",
): Promise<void> {
  if (!mentionedIds.length) return;
  await notify({
    recipientIds: mentionedIds,
    actorId,
    type: "TASK_MENTIONED",
    message: `${memberName(project, actorId)} mentioned you in the ${where} of "${task.title}"`,
    link: taskLink(project.id, task.id),
    projectId: project.id,
    refType: "TASK",
    refId: task.id,
    collapse: true,
  });
}

/** New comment: watchers except the actor and anyone already notified by a mention. */
export async function notifyComment(
  project: LoadedGroup,
  actorId: number,
  task: { id: number; title: string },
  alreadyNotified: number[],
): Promise<void> {
  const skip = new Set(alreadyNotified);
  await notify({
    recipientIds: async () => (await currentWatcherIds(project, task.id)).filter((id) => !skip.has(id)),
    actorId,
    type: "TASK_COMMENTED",
    message: `${memberName(project, actorId)} commented on "${task.title}"`,
    link: taskLink(project.id, task.id),
    projectId: project.id,
    refType: "TASK",
    refId: task.id,
    collapse: true,
  });
}

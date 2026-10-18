import { prisma } from "./prisma.js";
import { notify } from "./notify.js";
import { effectiveTaskKey } from "./taskKey.js";
import { manilaToday, parseDateOnly, formatDateOnly } from "./taskBoard.js";
import { taskLink } from "./taskWatchers.js";

// "Due tomorrow" and "overdue" reminders for a task's assignee. Planning data only: nothing here is read
// by scoring. Days are Manila calendar days (the same rule as the board). Each (task, person, kind, due
// date) is announced once, through TaskNotificationLog's unique row, so the hourly sweep and the lazy
// sweep on board reads can overlap without ever sending a duplicate.

export type DueKind = "DUE_SOON" | "OVERDUE";

/** "YYYY-MM-DD" plus `days`, with UTC arithmetic so no time zone can move the day. */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Due tomorrow, overdue (before today), or nothing (today, later, or no date). Pure. */
export function classifyDue(dueDate: string | null, today: string): DueKind | null {
  if (!dueDate) return null;
  if (dueDate === addDaysIso(today, 1)) return "DUE_SOON";
  if (dueDate < today) return "OVERDUE";
  return null;
}

const KIND_TO_ALERT = { DUE_SOON: "TASK_DUE_SOON", OVERDUE: "TASK_OVERDUE" } as const;

function niceDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${iso}T00:00:00.000Z`));
}

export interface SweepResult {
  checked: number;
  dueSoon: number;
  overdue: number;
}

/**
 * One pass. Only tasks that are not Done, have an assignee who is still an active member of the group and
 * a due date of tomorrow or earlier. `projectId` limits it to one group (the lazy sweep).
 */
export async function runTaskDueSweep(now: Date = new Date(), opts: { projectId?: number } = {}): Promise<SweepResult> {
  const today = manilaToday(now);
  const tomorrow = addDaysIso(today, 1);
  const result: SweepResult = { checked: 0, dueSoon: 0, overdue: 0 };

  const tasks = await prisma.task.findMany({
    where: {
      status: { not: "DONE" },
      assignedToUserId: { not: null },
      dueDate: { not: null, lte: parseDateOnly(tomorrow)! },
      ...(opts.projectId !== undefined ? { projectId: opts.projectId } : {}),
    },
    select: {
      id: true, projectId: true, number: true, title: true, dueDate: true, assignedToUserId: true,
      project: { select: { taskKey: true, groupName: true } },
    },
  });
  if (tasks.length === 0) return result;

  const memberships = await prisma.groupMembership.findMany({
    where: {
      projectId: { in: [...new Set(tasks.map((t) => t.projectId))] },
      userId: { in: [...new Set(tasks.map((t) => t.assignedToUserId!))] },
      user: { active: true, deletedAt: null },
    },
    select: { projectId: true, userId: true },
  });
  const members = new Set(memberships.map((m) => `${m.projectId}:${m.userId}`));

  for (const task of tasks) {
    const userId = task.assignedToUserId!;
    if (!members.has(`${task.projectId}:${userId}`)) continue;
    const due = formatDateOnly(task.dueDate);
    const kind = classifyDue(due, today);
    if (!kind || !due) continue;
    result.checked++;

    // Claim this announcement. The unique row means exactly one caller wins, however the sweeps overlap.
    try {
      await prisma.taskNotificationLog.create({ data: { taskId: task.id, userId, kind, dueDate: task.dueDate! } });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") continue; // already announced
      throw err;
    }

    const key = `${effectiveTaskKey(task.project)}-${task.number}`;
    await notify({
      recipientIds: userId,
      type: KIND_TO_ALERT[kind],
      message: kind === "DUE_SOON"
        ? `${key} "${task.title}" is due tomorrow`
        : `${key} "${task.title}" is overdue (was due ${niceDate(due)})`,
      link: taskLink(task.projectId, task.id),
      projectId: task.projectId,
      refType: "TASK",
      refId: task.id,
      collapse: true,
    });
    if (kind === "DUE_SOON") result.dueSoon++; else result.overdue++;
  }
  return result;
}

// ── Hourly sweep (started from index.ts only, so tests never run a timer) ─────────────────────────

const HOUR_MS = 60 * 60 * 1000;

export function startTaskDueSweep(): void {
  const run = () => {
    runTaskDueSweep().catch((err) => console.error("[taskDueSweep] sweep failed:", err instanceof Error ? err.message : err));
  };
  setTimeout(run, 30_000).unref();
  setInterval(run, HOUR_MS).unref();
}

// ── Lazy sweep on board reads: the host may sleep through the hourly timer ─────────────────────────

const LAZY_MIN_GAP_MS = 10 * 60 * 1000;
const lastLazyRun = new Map<number, number>();
let lazyEnabled = process.env.NODE_ENV !== "test";
let lazyIdle: Promise<void> = Promise.resolve();

/** Tests switch the lazy sweep on for one test file; otherwise it is off under NODE_ENV=test. */
export function setLazySweepEnabled(on: boolean): void {
  lazyEnabled = on;
  if (!on) lastLazyRun.clear();
}

/** Resolves when any lazy sweep that is running has finished (tests only). */
export function lazySweepIdle(): Promise<void> {
  return lazyIdle;
}

/**
 * Called after a board read. Starts a sweep for that group unless one ran in the last 10 minutes in this
 * process. Never throws and is never awaited by the request, so it cannot slow or fail a board read.
 * Returns false when it was skipped.
 */
export function triggerLazyDueSweep(projectId: number, now: Date = new Date()): boolean {
  if (!lazyEnabled) return false;
  const last = lastLazyRun.get(projectId);
  if (last !== undefined && now.getTime() - last < LAZY_MIN_GAP_MS) return false;
  lastLazyRun.set(projectId, now.getTime());
  lazyIdle = runTaskDueSweep(now, { projectId })
    .then(() => undefined)
    .catch((err) => console.error(`[taskDueSweep] lazy sweep failed for group ${projectId}:`, err instanceof Error ? err.message : err));
  return true;
}

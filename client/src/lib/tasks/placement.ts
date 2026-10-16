import type { BoardTask, TaskStatus } from "@shared/taskTypes";
import { TASK_STATUSES } from "@shared/taskTypes";

// Pure helpers for dragging cards between and inside columns. The server owns the real position
// (POST .../move computes it); the client only needs the neighbours and a good local guess so the
// card does not jump while the request is in flight.

export type Columns = Record<TaskStatus, number[]>;

const STEP = 1024;

export function emptyColumns(): Columns {
  return { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
}

/** Task ids per column, sorted by (position, id). */
export function columnsFromTasks(tasks: BoardTask[]): Columns {
  const cols = emptyColumns();
  const sorted = [...tasks].sort((a, b) => a.position - b.position || a.id - b.id);
  for (const t of sorted) cols[t.status].push(t.id);
  return cols;
}

export function statusOfTask(cols: Columns, id: number): TaskStatus | null {
  return TASK_STATUSES.find((s) => cols[s].includes(id)) ?? null;
}

export interface Placement {
  status: TaskStatus;
  afterId: number | null;
  beforeId: number | null;
}

/** Where `id` sits in `cols`, as the neighbours the move endpoint expects. */
export function placementOf(cols: Columns, id: number): Placement | null {
  const status = statusOfTask(cols, id);
  if (!status) return null;
  const list = cols[status];
  const i = list.indexOf(id);
  const prev = list[i - 1] ?? null;
  const next = list[i + 1] ?? null;
  // Drop right after the previous card when there is one, otherwise right before the next one.
  return prev !== null
    ? { status, afterId: prev, beforeId: null }
    : { status, afterId: null, beforeId: next };
}

export function samePlacement(a: Placement | null, b: Placement | null): boolean {
  return !!a && !!b && a.status === b.status && a.afterId === b.afterId && a.beforeId === b.beforeId;
}

/** A local position for the moved card (the server's answer replaces it). */
export function guessPosition(tasks: BoardTask[], id: number, p: Placement): number {
  const column = tasks
    .filter((t) => t.status === p.status && t.id !== id)
    .sort((a, b) => a.position - b.position || a.id - b.id);
  const at = (taskId: number | null) => column.find((t) => t.id === taskId);
  if (p.afterId !== null) {
    const i = column.findIndex((t) => t.id === p.afterId);
    if (i < 0) return (column[column.length - 1]?.position ?? 0) + STEP;
    const lower = column[i]!.position;
    const upper = column[i + 1]?.position;
    return upper === undefined ? lower + STEP : lower + (upper - lower) / 2;
  }
  if (p.beforeId !== null) {
    const upperTask = at(p.beforeId);
    if (!upperTask) return (column[column.length - 1]?.position ?? 0) + STEP;
    const i = column.indexOf(upperTask);
    const lower = column[i - 1]?.position;
    return lower === undefined ? upperTask.position - STEP : lower + (upperTask.position - lower) / 2;
  }
  return (column[column.length - 1]?.position ?? 0) + STEP;
}

/** Move `id` to `index` of `status` inside a copy of the columns. */
export function moveInColumns(cols: Columns, id: number, status: TaskStatus, index: number): Columns {
  const next = emptyColumns();
  for (const s of TASK_STATUSES) next[s] = cols[s].filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, next[status].length));
  next[status].splice(at, 0, id);
  return next;
}

// The Tasks filters are remembered per user per group in localStorage (best effort), like the view.
// The search text is deliberately NOT remembered: it starts empty on every visit.

import type { BoardResponse, TaskPriority } from "@shared/taskTypes";
import { TASK_PRIORITIES } from "@shared/taskTypes";
import type { DueBucket } from "./dates";
import { NO_FILTERS, type TaskFilters } from "./filters";

const DUE_BUCKETS: DueBucket[] = ["overdue", "this-week", "later"];

const storageKey = (userId: number | null, projectId: number) => `ft.tasks.filters.${userId ?? "anon"}.${projectId}`;

const ids = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isInteger(x)) : [];

/** Everything except search, which is never stored. */
export function hasRememberedFilter(f: TaskFilters): boolean {
  return f.myTasks || f.memberIds.length > 0 || f.priorities.length > 0 || f.labelIds.length > 0 || f.milestoneId !== null || f.due !== null;
}

export function parseFilters(raw: string | null): TaskFilters {
  if (!raw) return NO_FILTERS;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== "object") return NO_FILTERS;
    return {
      search: "",
      memberIds: ids(v.memberIds),
      myTasks: v.myTasks === true,
      priorities: Array.isArray(v.priorities)
        ? v.priorities.filter((p): p is TaskPriority => (TASK_PRIORITIES as readonly unknown[]).includes(p))
        : [],
      labelIds: ids(v.labelIds),
      milestoneId: typeof v.milestoneId === "number" && Number.isInteger(v.milestoneId) ? v.milestoneId : null,
      due: (DUE_BUCKETS as unknown[]).includes(v.due) ? (v.due as DueBucket) : null,
    };
  } catch {
    return NO_FILTERS;
  }
}

export function readStoredFilters(userId: number | null, projectId: number): TaskFilters {
  try {
    return parseFilters(window.localStorage.getItem(storageKey(userId, projectId)));
  } catch {
    return NO_FILTERS; // storage can be blocked or throw (private windows, site data off)
  }
}

export function storeFilters(userId: number | null, projectId: number, filters: TaskFilters): void {
  try {
    const key = storageKey(userId, projectId);
    if (!hasRememberedFilter(filters)) {
      window.localStorage.removeItem(key);
      return;
    }
    const { search: _search, ...rest } = filters;
    window.localStorage.setItem(key, JSON.stringify(rest));
  } catch {
    /* remembering filters is a convenience only */
  }
}

/**
 * Drops remembered members, labels and milestones that no longer exist on the board, so a stale filter
 * never silently hides tasks. Returns the same object when nothing changed.
 */
export function pruneFilters(f: TaskFilters, board: BoardResponse): TaskFilters {
  const memberIds = f.memberIds.filter((id) => board.members.some((m) => m.userId === id));
  const labelIds = f.labelIds.filter((id) => board.labels.some((l) => l.id === id));
  const milestoneId = f.milestoneId !== null && board.milestones.some((m) => m.id === f.milestoneId) ? f.milestoneId : null;
  const myTasks = f.myTasks && board.viewer.isMember;
  if (memberIds.length === f.memberIds.length && labelIds.length === f.labelIds.length && milestoneId === f.milestoneId && myTasks === f.myTasks) return f;
  return { ...f, memberIds, labelIds, milestoneId, myTasks };
}

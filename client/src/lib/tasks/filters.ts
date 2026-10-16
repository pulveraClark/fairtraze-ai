import type { BoardMember, BoardTask, TaskPriority } from "@shared/taskTypes";
import { dueBucket, todayManila, type DueBucket } from "./dates";

export interface TaskFilters {
  search: string;
  /** Show tasks assigned to any of these members. */
  memberIds: number[];
  myTasks: boolean;
  priorities: TaskPriority[];
  labelIds: number[];
  milestoneId: number | null;
  due: DueBucket | null;
}

export const NO_FILTERS: TaskFilters = {
  search: "", memberIds: [], myTasks: false, priorities: [], labelIds: [], milestoneId: null, due: null,
};

/** Filters other than the member avatars and "My tasks" (the ones behind the Filter menu). */
export function menuFilterCount(f: TaskFilters): number {
  return (f.priorities.length ? 1 : 0) + (f.labelIds.length ? 1 : 0) + (f.milestoneId !== null ? 1 : 0) + (f.due ? 1 : 0);
}

export function hasAnyFilter(f: TaskFilters): boolean {
  return !!f.search.trim() || f.memberIds.length > 0 || f.myTasks || menuFilterCount(f) > 0;
}

export function filterTasks(
  tasks: BoardTask[],
  f: TaskFilters,
  ctx: { userId: number; today?: string },
): BoardTask[] {
  const needle = f.search.trim().toLowerCase();
  const today = ctx.today ?? todayManila();
  return tasks.filter((t) => {
    if (needle && !`${t.key} ${t.title} ${t.description ?? ""}`.toLowerCase().includes(needle)) return false;
    if (f.myTasks && t.assignedToUserId !== ctx.userId) return false;
    if (f.memberIds.length && (t.assignedToUserId === null || !f.memberIds.includes(t.assignedToUserId))) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.labelIds.length && !f.labelIds.some((id) => t.labelIds.includes(id))) return false;
    if (f.milestoneId !== null && t.milestoneId !== f.milestoneId) return false;
    if (f.due && dueBucket(t.dueDate, t.status, today) !== f.due) return false;
    return true;
  });
}

/** "Showing tasks for Ben Cruz · 2 of 8 tasks" (or just the count when no member is selected). */
export function statusLine(f: TaskFilters, members: BoardMember[], shown: number, total: number): string | null {
  if (!hasAnyFilter(f)) return null;
  const names = f.memberIds
    .map((id) => members.find((m) => m.userId === id)?.name)
    .filter((n): n is string => !!n);
  const count = `${shown} of ${total} ${total === 1 ? "task" : "tasks"}`;
  return names.length ? `Showing tasks for ${names.join(", ")} · ${count}` : `Showing ${count}`;
}

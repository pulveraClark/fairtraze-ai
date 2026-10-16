import { TASK_STATUSES, type BoardResponse, type BoardTask } from "@shared/taskTypes";

export type SortKey = "key" | "title" | "assignee" | "status" | "priority" | "due" | "milestone" | "labels";
export type SortDir = "asc" | "desc";
export interface Sort { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: Sort = { key: "key", dir: "asc" };

const PRIORITY_RANK = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

type Cell = string | number | null;
type Lookups = Pick<BoardResponse, "members" | "milestones" | "labels">;

/** The value a column sorts by. `null` means "empty", which always sorts last in either direction. */
function cell(task: BoardTask, key: SortKey, board: Lookups): Cell {
  switch (key) {
    case "key": return task.number;
    case "title": return task.title.toLowerCase();
    case "assignee": return board.members.find((m) => m.userId === task.assignedToUserId)?.name.toLowerCase() ?? null;
    case "status": return TASK_STATUSES.indexOf(task.status);
    case "priority": return PRIORITY_RANK[task.priority];
    case "due": return task.dueDate;
    case "milestone": return board.milestones.find((m) => m.id === task.milestoneId)?.name.toLowerCase() ?? null;
    case "labels": {
      const names = task.labelIds
        .map((id) => board.labels.find((l) => l.id === id)?.name.toLowerCase())
        .filter((n): n is string => !!n)
        .sort();
      return names.length ? names.join(",") : null;
    }
  }
}

function compare(a: Cell, b: Cell): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** A sorted copy. Ties fall back to the task number, so the order is stable between polls. */
export function sortTasks(tasks: BoardTask[], sort: Sort, board: Lookups): BoardTask[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...tasks].sort((x, y) => {
    const a = cell(x, sort.key, board);
    const b = cell(y, sort.key, board);
    if (a === null && b !== null) return 1;
    if (b === null && a !== null) return -1;
    const primary = a === null || b === null ? 0 : compare(a, b) * sign;
    return primary || x.number - y.number;
  });
}

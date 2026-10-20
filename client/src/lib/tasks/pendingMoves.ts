import type { BoardResponse, BoardTask } from "@shared/taskTypes";
import { replaceTaskIn } from "./board";

// Moves that are saved to the server but not answered yet. A poll that lands meanwhile carries the
// old column, so the board query lays these optimistic tasks back over its result (never the other way).

const pending = new Map<string, Map<number, BoardTask>>();

const scopeOf = (uid: number | null, projectId: number) => `${uid ?? "none"}:${projectId}`;

export function markMovePending(uid: number | null, projectId: number, task: BoardTask): void {
  const scope = scopeOf(uid, projectId);
  const tasks = pending.get(scope) ?? new Map<number, BoardTask>();
  tasks.set(task.id, task);
  pending.set(scope, tasks);
}

export function clearMovePending(uid: number | null, projectId: number, taskId: number): void {
  const scope = scopeOf(uid, projectId);
  const tasks = pending.get(scope);
  if (!tasks) return;
  tasks.delete(taskId);
  if (tasks.size === 0) pending.delete(scope);
}

/** The server's board with every task that has a pending move kept where the user dropped it. */
export function mergePending(uid: number | null, projectId: number, board: BoardResponse): BoardResponse {
  const tasks = pending.get(scopeOf(uid, projectId));
  if (!tasks) return board;
  let merged = board;
  for (const t of tasks.values()) {
    if (merged.tasks.some((s) => s.id === t.id)) merged = replaceTaskIn(merged, t);
  }
  return merged;
}

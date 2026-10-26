import { useCallback, useSyncExternalStore } from "react";
import type { BoardResponse, BoardTask } from "@shared/taskTypes";
import { replaceTaskIn } from "./board";

// Moves that are saved to the server but not answered yet. A poll that lands meanwhile carries the
// old column, so the board query lays these optimistic tasks back over its result (never the other way).
// The same entries tell the board which cards are "saving", so each card can lock itself.

const pending = new Map<string, Map<number, BoardTask>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
// Stable snapshots for useSyncExternalStore: replaced only when a scope's set of ids changes.
const snapshots = new Map<string, readonly number[]>();
const NONE: readonly number[] = Object.freeze([]);

/**
 * A request that never answers must not lock a card forever: after this long the entry is dropped
 * and the card unlocks. The request itself is untouched, so a late answer still lands normally.
 */
export const PENDING_MOVE_TIMEOUT_MS = 30_000;

const scopeOf = (uid: number | null, projectId: number) => `${uid ?? "none"}:${projectId}`;
const timerKey = (scope: string, taskId: number) => `${scope}#${taskId}`;

function publish(scope: string): void {
  const ids = [...(pending.get(scope)?.keys() ?? [])].sort((a, b) => a - b);
  if (ids.length === 0) snapshots.delete(scope);
  else snapshots.set(scope, ids);
  listeners.forEach((l) => l());
}

function drop(scope: string, taskId: number): void {
  const key = timerKey(scope, taskId);
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
  const tasks = pending.get(scope);
  if (!tasks) return;
  tasks.delete(taskId);
  if (tasks.size === 0) pending.delete(scope);
}

export function markMovePending(uid: number | null, projectId: number, task: BoardTask): void {
  const scope = scopeOf(uid, projectId);
  const tasks = pending.get(scope) ?? new Map<number, BoardTask>();
  tasks.set(task.id, task);
  pending.set(scope, tasks);
  const key = timerKey(scope, task.id);
  const old = timers.get(key);
  if (old) clearTimeout(old);
  timers.set(key, setTimeout(() => {
    drop(scope, task.id);
    publish(scope);
  }, PENDING_MOVE_TIMEOUT_MS));
  publish(scope);
}

export function clearMovePending(uid: number | null, projectId: number, taskId: number): void {
  const scope = scopeOf(uid, projectId);
  drop(scope, taskId);
  publish(scope);
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

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Ids of this group's tasks whose move is still saving. Re-renders when a move starts or settles. */
export function usePendingMoveIds(uid: number | null, projectId: number): readonly number[] {
  const scope = scopeOf(uid, projectId);
  const getSnapshot = useCallback(() => snapshots.get(scope) ?? NONE, [scope]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

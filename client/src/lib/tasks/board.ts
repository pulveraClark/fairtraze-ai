import type { BoardResponse, BoardTask, TaskStatus } from "@shared/taskTypes";
import { TASK_STATUS_LABELS } from "@shared/taskTypes";
import { guessPosition, type Placement } from "./placement";

/** Recompute each milestone's "X of Y" from the tasks (after an optimistic change). */
export function withMilestoneCounts(board: BoardResponse): BoardResponse {
  return {
    ...board,
    milestones: board.milestones.map((m) => {
      const inMs = board.tasks.filter((t) => t.milestoneId === m.id);
      return { ...m, total: inMs.length, done: inMs.filter((t) => t.status === "DONE").length };
    }),
  };
}

export function replaceTaskIn(board: BoardResponse, task: BoardTask): BoardResponse {
  const exists = board.tasks.some((t) => t.id === task.id);
  return withMilestoneCounts({
    ...board,
    tasks: exists ? board.tasks.map((t) => (t.id === task.id ? task : t)) : [...board.tasks, task],
  });
}

export function removeTaskFrom(board: BoardResponse, taskId: number): BoardResponse {
  return withMilestoneCounts({ ...board, tasks: board.tasks.filter((t) => t.id !== taskId) });
}

/** Optimistic move: same task, new status and a local position guess. The server's reply replaces it. */
export function applyMove(board: BoardResponse, taskId: number, p: Placement): BoardResponse {
  const position = guessPosition(board.tasks, taskId, p);
  return withMilestoneCounts({
    ...board,
    tasks: board.tasks.map((t) =>
      t.id === taskId ? { ...t, status: p.status, done: p.status === "DONE", position } : t,
    ),
  });
}

/** Why a drop on `to` is refused, for the toast and the column's "Not allowed" box. */
export function denyMessage(task: BoardTask, to: TaskStatus, isLeader: boolean, assigneeName: string | null): string {
  if (isLeader) return "";
  if (task.assignedToUserId === null) return "Only the group leader can move this task.";
  if (task.status === "DONE") return "Only the group leader can move a task out of Done.";
  if (to === "DONE") return "Only the group leader can mark a task Done.";
  return `Only ${assigneeName ?? "the assigned member"} or the group leader can move this task.`;
}

export function statusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

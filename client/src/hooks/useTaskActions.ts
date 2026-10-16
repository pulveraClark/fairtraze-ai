import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardResponse, BoardTask, BulkAction, BulkEditResponse, TaskStatus } from "@shared/taskTypes";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { groupKeys } from "./useGroupQueries";
import { taskApi, TaskApiError, type CreateTaskInput, type UpdateTaskInput } from "../lib/tasks/api";
import { applyMove, removeTaskFrom, replaceTaskIn, statusLabel } from "../lib/tasks/board";
import { columnsFromTasks, placementOf, type Placement } from "../lib/tasks/placement";

/**
 * Mutations for the Tasks board. Each one updates the cached board optimistically where it makes
 * sense, replaces the task with the server's answer, and on a 409 (someone else changed it) or any
 * other failure restores the board and tells the user. Nothing is ever silently overwritten.
 */
export function useTaskActions(projectId: number) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  const queryClient = useQueryClient();
  const { showToast, showSuccessToast } = useToast();
  const key = groupKeys.tasks(uid, projectId);

  const getBoard = useCallback(() => queryClient.getQueryData<BoardResponse>(key), [queryClient, key]);
  const setBoard = useCallback(
    (fn: (b: BoardResponse) => BoardResponse) => queryClient.setQueryData<BoardResponse>(key, (b) => (b ? fn(b) : b)),
    [queryClient, key],
  );
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [queryClient, key]);

  /** Shared failure handling: show a clear message and bring the board back in line with the server. */
  const handleFailure = useCallback((err: unknown, snapshot?: BoardResponse) => {
    if (snapshot) queryClient.setQueryData(key, snapshot);
    if (err instanceof TaskApiError && err.isConflict) {
      if (err.task) setBoard((b) => replaceTaskIn(b, err.task!));
      showToast({ tone: "error", message: "Someone else changed this task. The latest version is shown." });
    } else {
      showToast({ tone: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    }
    void refresh();
  }, [queryClient, key, setBoard, showToast, refresh]);

  const moveTask = useCallback(async (
    task: BoardTask,
    to: Placement,
    opts: { previous?: Placement | null; undo?: boolean } = {},
  ): Promise<BoardTask | null> => {
    const snapshot = getBoard();
    setBoard((b) => applyMove(b, task.id, to));
    try {
      const saved = await taskApi.move(token, projectId, task, to);
      setBoard((b) => replaceTaskIn(b, saved));
      if (opts.undo) {
        showSuccessToast("Move undone.");
      } else if (saved.status !== task.status) {
        const previous = opts.previous ?? null;
        showToast({
          message: `Moved ${saved.key} to ${statusLabel(saved.status)}. Saved to task history.`,
          actionLabel: previous ? "Undo" : undefined,
          onAction: previous ? () => { void moveTask(saved, previous, { undo: true }); } : undefined,
        });
      }
      return saved;
    } catch (err) {
      handleFailure(err, snapshot);
      return null;
    }
  }, [getBoard, setBoard, token, projectId, showToast, showSuccessToast, handleFailure]);

  /** Move a task to the bottom of a column (the status menu and quick add use this). */
  const moveToStatus = useCallback((task: BoardTask, status: TaskStatus) => {
    const board = getBoard();
    const cols = columnsFromTasks((board?.tasks ?? []).filter((t) => t.id !== task.id));
    const last = cols[status][cols[status].length - 1] ?? null;
    const previous = board ? placementOf(columnsFromTasks(board.tasks), task.id) : null;
    return moveTask(task, { status, afterId: last, beforeId: null }, { previous });
  }, [getBoard, moveTask]);

  /** Create a task; a leader may create straight into another column (create, then move to the bottom). */
  const createTask = useCallback(async (input: CreateTaskInput, status: TaskStatus = "TODO"): Promise<BoardTask> => {
    const created = await taskApi.create(token, projectId, input);
    setBoard((b) => replaceTaskIn(b, created));
    if (status !== "TODO") {
      const moved = await moveToStatus(created, status);
      return moved ?? created;
    }
    return created;
  }, [token, projectId, setBoard, moveToStatus]);

  const updateTask = useCallback(async (task: BoardTask, input: UpdateTaskInput): Promise<BoardTask> => {
    try {
      const saved = await taskApi.update(token, projectId, task, input);
      setBoard((b) => replaceTaskIn(b, saved));
      return saved;
    } catch (err) {
      if (err instanceof TaskApiError && err.isConflict && err.task) setBoard((b) => replaceTaskIn(b, err.task!));
      if (err instanceof TaskApiError && err.isConflict) {
        showToast({ tone: "error", message: "Someone else changed this task. The latest version is shown." });
      }
      throw err;
    }
  }, [token, projectId, setBoard, showToast]);

  /**
   * Leader-only bulk edit. Not optimistic: the server decides per task what it can apply, so the board
   * is updated from its answer. Returns the result (with the tasks it skipped), or null on failure.
   */
  const bulkEdit = useCallback(async (taskIds: number[], action: BulkAction): Promise<BulkEditResponse | null> => {
    try {
      const res = await taskApi.bulk(token, projectId, taskIds, action);
      setBoard((b) => res.tasks.reduce(replaceTaskIn, b));
      return res;
    } catch (err) {
      handleFailure(err);
      return null;
    }
  }, [token, projectId, setBoard, handleFailure]);

  const deleteTask = useCallback(async (task: BoardTask): Promise<void> => {
    await taskApi.remove(token, projectId, task.id);
    setBoard((b) => removeTaskFrom(b, task.id));
    showSuccessToast(`Deleted ${task.key}.`);
  }, [token, projectId, setBoard, showSuccessToast]);

  const createMilestone = useCallback(async (input: { name: string; dueDate?: string | null }) => {
    const created = await taskApi.createMilestone(token, projectId, input);
    await refresh();
    return created;
  }, [token, projectId, refresh]);

  const createLabel = useCallback(async (input: Parameters<typeof taskApi.createLabel>[2]) => {
    const created = await taskApi.createLabel(token, projectId, input);
    await refresh();
    return created;
  }, [token, projectId, refresh]);

  return { moveTask, moveToStatus, createTask, updateTask, bulkEdit, deleteTask, createMilestone, createLabel, refresh, showError: (message: string) => showToast({ tone: "error", message }) };
}

export type TaskActions = ReturnType<typeof useTaskActions>;

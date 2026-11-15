import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskDetails } from "@shared/taskTypes";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast";
import { groupKeys } from "./useGroupQueries";
import { POLL_10S } from "./pollingOptions";
import { taskApi } from "../lib/tasks/api";
import { errorMessage } from "../lib/feedback";

/**
 * Everything the details window shows beyond the board payload (subtasks, attachments, comments,
 * history, watchers), polled every 10 s while the window is open. Each mutation refreshes the
 * details and the board (the card shows subtask progress) and reports a failure in plain words.
 */
export function useTaskDetails(projectId: number, taskId: number) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  const queryClient = useQueryClient();
  const { showToast, showSuccessToast } = useToast();
  const [inFlight, setInFlight] = useState(0);
  const key = groupKeys.taskDetails(uid, projectId, taskId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => taskApi.details(token, projectId, taskId),
    enabled: !!token && uid !== null,
    retry: false,
    ...POLL_10S,
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: groupKeys.tasks(uid, projectId) }),
    ]);
  }, [queryClient, key, uid, projectId]);

  /**
   * Runs a mutation, refreshes, and returns its result, or null after showing the error.
   * `success` is shown only after the server confirmed. Leave it out on purpose when the screen already
   * shows the result (ticking a subtask, reordering, watching, posting a comment).
   */
  const run = useCallback(async <T,>(fn: () => Promise<T>, opts: { quiet?: boolean; success?: string } = {}): Promise<T | null> => {
    setInFlight((n) => n + 1);
    try {
      const result = await fn();
      await refresh();
      if (opts.success) showSuccessToast(opts.success);
      return result;
    } catch (err) {
      if (!opts.quiet) showToast({ tone: "error", message: errorMessage(err, "Could not save the change. Try again.") });
      void refresh();
      return null;
    } finally {
      setInFlight((n) => n - 1);
    }
  }, [refresh, showToast, showSuccessToast]);

  return {
    query,
    details: query.data,
    /** True while any change from the details window is still being saved. */
    busy: inFlight > 0,
    addSubtask: (title: string) => run(() => taskApi.addSubtask(token, projectId, taskId, title), { success: "Subtask added." }),
    setSubtaskDone: (id: number, done: boolean) => run(() => taskApi.updateSubtask(token, projectId, taskId, id, { done })),
    removeSubtask: (id: number) => run(() => taskApi.removeSubtask(token, projectId, taskId, id), { success: "Subtask deleted." }),
    reorderSubtasks: (ids: number[]) => run(() => taskApi.reorderSubtasks(token, projectId, taskId, ids)),
    uploadAttachment: (file: Blob, filename: string) => run(() => taskApi.uploadAttachment(token, projectId, taskId, file, filename), { success: "File added." }),
    removeAttachment: (id: number) => run(() => taskApi.removeAttachment(token, projectId, taskId, id), { success: "File removed." }),
    addComment: (body: string) => run(() => taskApi.addComment(token, projectId, taskId, body)),
    editComment: (id: number, body: string) => run(() => taskApi.editComment(token, projectId, taskId, id, body), { success: "Comment updated." }),
    removeComment: (id: number) => run(() => taskApi.removeComment(token, projectId, taskId, id), { success: "Comment deleted." }),
    setWatching: async (on: boolean) => {
      const next = await run(() => taskApi.watch(token, projectId, taskId, on));
      if (next) queryClient.setQueryData<TaskDetails>(key, next);
      return next;
    },
  };
}

export type TaskDetailsApi = ReturnType<typeof useTaskDetails>;

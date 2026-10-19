import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BoardResponse } from "@shared/taskTypes";
import { useAuth } from "../../context/AuthContext";
import { groupKeys } from "../../hooks/useGroupQueries";
import { useToast } from "../Toast";
import { taskApi } from "../../lib/tasks/api";
import { formatAgo } from "../../lib/tasks/dates";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";

interface Props {
  board: BoardResponse;
  onClose: () => void;
}

/**
 * Leader-only "Commit linking" window (opened from the Tasks "..." menu): how commits link to tasks and
 * "Refresh commits" with the time of the last refresh. Commit linking reads commit messages only and never
 * changes a contribution score. The server enforces who may refresh and how often; this only explains and asks.
 */
export function CommitLinkingDialog({ board, onClose }: Props) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast, showSuccessToast } = useToast();
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [, setTick] = useState(0);
  const { group, viewer } = board;
  const canRefresh = viewer.isLeader && group.hasRepo;

  // "Last refreshed 3 min ago" stays current without waiting for the board to change.
  useEffect(() => {
    if (!group.commitsRefreshedAt) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [group.commitsRefreshedAt]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await taskApi.syncCommits(token, group.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: groupKeys.tasks(user?.id ?? null, group.id) }),
        queryClient.invalidateQueries({ queryKey: ["group", user?.id ?? null, "task-details", group.id] }),
      ]);
      showSuccessToast(
        result.linked === 0
          ? "Commits refreshed. No new commits to link."
          : `Commits refreshed. Linked ${result.linked} new ${result.linked === 1 ? "commit" : "commits"}.`,
      );
    } catch (err) {
      const text = err instanceof Error ? err.message : "Could not refresh commits.";
      setMessage(text);
      showToast({ tone: "error", message: text });
      // A refused (too soon) refresh still tells us when the last one was.
      void queryClient.invalidateQueries({ queryKey: groupKeys.tasks(user?.id ?? null, group.id) });
    } finally {
      setBusy(false);
    }
  }

  const aliasNote = group.keyAliases.length > 0 ? ` Earlier keys still link: ${group.keyAliases.join(", ")}.` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="commit-linking-title" className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="commit-linking-title" className="text-lg font-semibold text-slate-900">Commit linking</h2>
        <p className="text-sm text-slate-800">
          {group.hasRepo
            ? <>Put a task's key, like <span className="font-semibold text-slate-900">{group.taskKey}-12</span>, in a commit message to link that commit to the task.{aliasNote}</>
            : <>This group has no GitHub repository, so commits are not linked to tasks.</>}
        </p>

        {canRefresh && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" onClick={() => void refresh()} disabled={busy} className={BUTTON_SECONDARY_COMPACT}>
              {busy ? "Refreshing…" : "Refresh commits"}
            </button>
            <span className="text-sm text-slate-700" aria-live="polite">
              {group.commitsRefreshedAt ? `Last refreshed ${formatAgo(group.commitsRefreshedAt)}` : "Not refreshed yet"}
            </span>
          </div>
        )}
        {message && <p role="alert" className="text-sm font-medium text-red-800">{message}</p>}
        <p className="text-xs text-slate-700">Only commit messages are read. Linking never changes contribution scores.</p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function TaskKeyDialog({ board, onClose }: { board: BoardResponse; onClose: () => void }) {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { showSuccessToast } = useToast();
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [key, setKey] = useState(board.group.taskKey);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const current = board.group.taskKey;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = key.trim().toUpperCase();
    if (busy || !next) return;
    if (next === current) { onClose(); return; }
    setBusy(true);
    setError("");
    try {
      const result = await taskApi.changeTaskKey(token, board.group.id, next);
      await queryClient.invalidateQueries({ queryKey: groupKeys.tasks(user?.id ?? null, board.group.id) });
      showSuccessToast(`Task key is now ${result.taskKey}. ${current}-… in commit messages still links.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the task key.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="task-key-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="task-key-title" className="text-lg font-semibold text-slate-900">Change task key</h2>
        <p className="mt-1 text-sm text-slate-800">
          Tasks show as {current}-1, {current}-2 and so on. The new key replaces it everywhere. Commits that still use{" "}
          {current} keep linking.
        </p>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div>
            <label htmlFor="task-key-input" className="mb-1 block text-sm font-medium text-slate-900">New key</label>
            <input
              id="task-key-input"
              value={key}
              maxLength={5}
              autoFocus
              onChange={(e) => { setKey(e.target.value.toUpperCase()); setError(""); }}
              aria-describedby="task-key-help"
              className={`min-h-9 w-32 rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm uppercase text-slate-900 ${FOCUS_LIGHT}`}
            />
            <p id="task-key-help" className="mt-1 text-xs text-slate-700">2 to 5 letters or digits, starting with a letter. A key this group used before cannot be used again.</p>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-red-800">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
            <button type="submit" disabled={busy || !key.trim()} className={BUTTON_PRIMARY_COMPACT}>Change key</button>
          </div>
        </form>
      </div>
    </div>
  );
}

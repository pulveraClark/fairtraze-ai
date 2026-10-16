import { useState } from "react";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type BoardResponse, type TaskPriority } from "@shared/taskTypes";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";
import type { TaskActions } from "../../hooks/useTaskActions";

interface Props {
  board: BoardResponse;
  actions: TaskActions;
  onClose: () => void;
  onCreated: (taskId: number) => void;
}

const FIELD = `min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 ${FOCUS_LIGHT}`;

/** "New task". Any member can create one (it starts unassigned in To do); only the leader can assign. */
export function NewTaskDialog({ board, actions, onClose, onCreated }: Props) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await actions.createTask({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        ...(board.viewer.isLeader && assignee ? { assignedToUserId: Number(assignee) } : {}),
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="new-task-title" className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="new-task-title" className="text-lg font-semibold text-slate-900">New task</h2>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div>
            <label htmlFor="nt-title" className="mb-1 block text-sm font-medium text-slate-900">Title</label>
            <input id="nt-title" value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} className={FIELD} />
          </div>
          <div>
            <label htmlFor="nt-desc" className="mb-1 block text-sm font-medium text-slate-900">Description (optional)</label>
            <textarea id="nt-desc" value={description} rows={3} maxLength={5000} onChange={(e) => setDescription(e.target.value)} className={`${FIELD} py-2`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="nt-priority" className="mb-1 block text-sm font-medium text-slate-900">Priority</label>
              <select id="nt-priority" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={FIELD}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="nt-due" className="mb-1 block text-sm font-medium text-slate-900">Due date (optional)</label>
              <input id="nt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={FIELD} />
            </div>
          </div>
          {board.viewer.isLeader ? (
            <div>
              <label htmlFor="nt-assignee" className="mb-1 block text-sm font-medium text-slate-900">Assignee</label>
              <select id="nt-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={FIELD}>
                <option value="">Unassigned</option>
                {board.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            </div>
          ) : (
            <p className="text-sm text-slate-700">New tasks start unassigned in To do. The group leader can assign them.</p>
          )}
          {error && <p role="alert" className="text-sm font-medium text-red-800">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
            <button type="submit" disabled={!title.trim() || busy} className={BUTTON_PRIMARY_COMPACT}>Create task</button>
          </div>
        </form>
      </div>
    </div>
  );
}

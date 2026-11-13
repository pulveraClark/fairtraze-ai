import { useEffect, useRef, useState } from "react";
import { useToast } from "../Toast";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type BoardResponse, type TaskPriority } from "@shared/taskTypes";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";
import type { TaskActions } from "../../hooks/useTaskActions";
import { TitleCombobox } from "./TitleCombobox";

const SLOW_AFTER_MS = 15_000;

// No "item N": the order of AI-listed requirements is not guaranteed to match the instructions text.
const FROM_INSTRUCTIONS = "From the project instructions.";

interface Props {
  board: BoardResponse;
  actions: TaskActions;
  onClose: () => void;
  onCreated: (taskId: number) => void;
}

const FIELD = `min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 ${FOCUS_LIGHT}`;

/** "New task". Any member can create one (it starts unassigned in To do); only the leader can assign. */
export function NewTaskDialog({ board, actions, onClose, onCreated }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  // After this long still waiting, say so and let the person close the dialog (the task may still arrive).
  const [slow, setSlow] = useState(false);
  const busyRef = useRef(false);
  const slowRef = useRef(false);
  const mountedRef = useRef(true);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    mountedRef.current = false;
    if (slowTimer.current) clearTimeout(slowTimer.current);
  }, []);
  // While the request is running the dialog stays open (Esc, Cancel and the backdrop do nothing),
  // except once the "taking longer" message is showing.
  const close = () => {
    if (busyRef.current && !slowRef.current) return;
    onClose();
  };
  const ref = useFocusTrap<HTMLDivElement>(close);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState("");
  const [requirementKey, setRequirementKey] = useState<string | undefined>();
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busyRef.current) return; // a ref, so two quick clicks cannot both get through
    busyRef.current = true;
    slowRef.current = false;
    setBusy(true);
    setSlow(false);
    setError("");
    slowTimer.current = setTimeout(() => {
      slowRef.current = true;
      if (mountedRef.current) setSlow(true);
    }, SLOW_AFTER_MS);
    try {
      const created = await actions.createTask({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        ...(requirementKey ? { requirementKey } : {}),
        ...(board.viewer.isLeader && assignee ? { assignedToUserId: Number(assignee) } : {}),
      });
      if (slowTimer.current) clearTimeout(slowTimer.current);
      busyRef.current = false;
      showToast({ message: `${created.key} created.`, tone: "success" });
      if (mountedRef.current) onCreated(created.id);
    } catch (err) {
      if (slowTimer.current) clearTimeout(slowTimer.current);
      busyRef.current = false;
      slowRef.current = false;
      if (!mountedRef.current) return; // the person closed the dialog while it was slow
      setError(err instanceof Error && err.message ? err.message : "Could not create the task. Check your connection and try again. Your text is still here.");
      setBusy(false);
      setSlow(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="new-task-title" className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="new-task-title" className="text-lg font-semibold text-slate-900">New task</h2>
        <form onSubmit={submit} aria-busy={busy} className="mt-3 space-y-3">
          <div>
            <label htmlFor="nt-title" className="mb-1 block text-sm font-medium text-slate-900">Title</label>
            <TitleCombobox
              id="nt-title"
              value={title}
              maxLength={200}
              autoFocus
              onChange={setTitle}
              suggestions={board.viewer.isLeader ? board.suggestions ?? [] : []}
              onPick={(s) => {
                setTitle(s.text.slice(0, 200));
                setDescription(FROM_INSTRUCTIONS);
                setRequirementKey(s.key);
              }}
            />
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
          <p role="status" aria-live="polite" className={slow ? "text-sm text-slate-800" : "sr-only"}>
            {slow ? "Taking longer than usual. The task may still appear on the board." : busy ? "Creating the task." : ""}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={close} disabled={busy && !slow} className={BUTTON_SECONDARY_COMPACT}>
              {busy && slow ? "Close" : "Cancel"}
            </button>
            <button type="submit" disabled={!title.trim() || busy} className={BUTTON_PRIMARY_COMPACT}>
              {busy ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

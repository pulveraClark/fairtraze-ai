import { useState } from "react";
import type { BoardResponse } from "@shared/taskTypes";
import { formatDue, todayManila } from "../../lib/tasks/dates";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";
import { AlertTriangleIcon, FlagIcon, PlusIcon } from "./icons";

interface Props {
  board: BoardResponse;
  /** Currently filtered milestone id (clicking a card toggles it). */
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onCreate: (input: { name: string; dueDate: string | null }) => Promise<void>;
}

/** One card per milestone: name, "X of Y", progress bar and due date. Clicking filters the board. */
export function MilestoneStrip({ board, selectedId, onSelect, onCreate }: Props) {
  const [adding, setAdding] = useState(false);
  const canManage = board.viewer.canManageBoard;
  const deadlineDay = board.group.deadline ? todayManila(new Date(board.group.deadline)) : null;

  if (board.milestones.length === 0 && !canManage) return null;

  return (
    <section aria-label="Milestones" className="flex items-stretch gap-3 overflow-x-auto pb-1">
      {board.milestones.map((m) => {
        const pct = m.total === 0 ? 0 : Math.round((m.done / m.total) * 100);
        const late = !!(m.dueDate && deadlineDay && m.dueDate > deadlineDay);
        const selected = selectedId === m.id;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : m.id)}
            className={`w-56 shrink-0 rounded-xl border bg-white p-3 text-left ${FOCUS_LIGHT} ${
              selected ? "border-indigo-700 ring-1 ring-indigo-700" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <FlagIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{m.name}</span>
            </span>
            <span className="mt-1 flex items-center justify-between text-xs text-slate-700">
              <span className="tabular-nums">{m.done} of {m.total}</span>
              {m.dueDate && (
                <span className={`inline-flex items-center gap-1 ${late ? "font-semibold text-red-800" : ""}`}>
                  {late && <AlertTriangleIcon className="h-3.5 w-3.5" />}
                  Due {formatDue(m.dueDate)}
                </span>
              )}
            </span>
            <span
              role="progressbar"
              aria-label={`${m.name} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200"
            >
              <span className="block h-full bg-indigo-700" style={{ width: `${pct}%` }} />
            </span>
            {late && <span className="mt-1.5 block text-xs font-medium text-red-800">Due after the project deadline</span>}
          </button>
        );
      })}

      {canManage && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`flex w-40 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-400 bg-white p-3 text-sm font-medium text-slate-800 hover:bg-slate-50 ${FOCUS_LIGHT}`}
        >
          <PlusIcon className="h-4 w-4" />
          Add milestone
        </button>
      )}

      {adding && (
        <AddMilestoneDialog
          deadline={board.group.deadline}
          onClose={() => setAdding(false)}
          onCreate={async (input) => { await onCreate(input); setAdding(false); }}
        />
      )}
    </section>
  );
}

export function AddMilestoneDialog({ deadline, onClose, onCreate }: {
  deadline: string | null;
  onClose: () => void;
  onCreate: (input: { name: string; dueDate: string | null }) => Promise<void>;
}) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const afterDeadline = !!(dueDate && deadline && dueDate > todayManila(new Date(deadline)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), dueDate: dueDate || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the milestone.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="add-milestone-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="add-milestone-title" className="text-lg font-semibold text-slate-900">Add milestone</h2>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div>
            <label htmlFor="ms-name" className="mb-1 block text-sm font-medium text-slate-900">Name</label>
            <input
              id="ms-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className={`min-h-9 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 ${FOCUS_LIGHT}`}
            />
          </div>
          <div>
            <label htmlFor="ms-due" className="mb-1 block text-sm font-medium text-slate-900">Due date (optional)</label>
            <input
              id="ms-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`min-h-9 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 ${FOCUS_LIGHT}`}
            />
          </div>
          {afterDeadline && (
            <p role="status" className="flex items-start gap-1.5 text-sm font-medium text-red-800">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              This milestone is due after the project deadline.
            </p>
          )}
          {error && <p role="alert" className="text-sm font-medium text-red-800">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
            <button type="submit" disabled={!name.trim() || busy} className={BUTTON_PRIMARY_COMPACT}>Add milestone</button>
          </div>
        </form>
      </div>
    </div>
  );
}

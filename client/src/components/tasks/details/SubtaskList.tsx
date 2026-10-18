import { useState } from "react";
import { TASK_LIMITS, type BoardTask, type TaskSubtask } from "@shared/taskTypes";
import { BUTTON_PRIMARY_COMPACT, FOCUS_LIGHT } from "../../ui/styles";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "../icons";

interface Props {
  task: BoardTask;
  subtasks: TaskSubtask[];
  /** Why the controls are locked (shown as a tooltip), or null when the viewer may edit. */
  lockedReason: string | null;
  onAdd: (title: string) => Promise<unknown>;
  onToggle: (id: number, done: boolean) => Promise<unknown>;
  onRemove: (id: number) => Promise<unknown>;
  onReorder: (ids: number[]) => Promise<unknown>;
}

const ICON_BUTTON = `inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent ${FOCUS_LIGHT}`;

/** Subtasks: add, tick, reorder (up/down buttons), delete. 30 per task. Progress shows on the card. */
export function SubtaskList({ task, subtasks, lockedReason, onAdd, onToggle, onRemove, onReorder }: Props) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = lockedReason !== null;
  const done = subtasks.filter((s) => s.done).length;
  const pct = subtasks.length === 0 ? 0 : Math.round((done / subtasks.length) * 100);
  const full = subtasks.length >= TASK_LIMITS.subtasksPerTask;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy || locked || full) return;
    setBusy(true);
    const created = await onAdd(t);
    setBusy(false);
    if (created) setTitle("");
  }

  function move(index: number, delta: -1 | 1) {
    const ids = subtasks.map((s) => s.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to]!, ids[index]!];
    void onReorder(ids);
  }

  return (
    <section aria-labelledby={`subtasks-${task.id}`} title={locked ? lockedReason : undefined}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`subtasks-${task.id}`} className="text-sm font-semibold text-slate-900">Subtasks</h3>
        <span className="text-xs tabular-nums text-slate-700">{done} of {subtasks.length} done</span>
      </div>
      {subtasks.length > 0 && (
        <span
          role="progressbar"
          aria-label="Subtask progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200"
        >
          <span className="block h-full bg-indigo-700" style={{ width: `${pct}%` }} />
        </span>
      )}

      {subtasks.length === 0 && <p className="mt-2 text-sm text-slate-700">No subtasks yet.</p>}
      <ul className="mt-2 space-y-1">
        {subtasks.map((s, i) => (
          <li key={s.id} className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white pl-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-sm text-slate-900">
              <input
                type="checkbox"
                checked={s.done}
                disabled={locked}
                onChange={(e) => void onToggle(s.id, e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              <span className={`min-w-0 break-words ${s.done ? "text-slate-700 line-through" : ""}`}>{s.title}</span>
            </label>
            <button type="button" disabled={locked || i === 0} onClick={() => move(i, -1)} aria-label={`Move subtask up: ${s.title}`} className={ICON_BUTTON}>
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button type="button" disabled={locked || i === subtasks.length - 1} onClick={() => move(i, 1)} aria-label={`Move subtask down: ${s.title}`} className={ICON_BUTTON}>
              <ChevronDownIcon className="h-4 w-4" />
            </button>
            <button type="button" disabled={locked} onClick={() => void onRemove(s.id)} aria-label={`Delete subtask: ${s.title}`} className={ICON_BUTTON}>
              <CloseIcon className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      {!locked && (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <label htmlFor={`subtask-new-${task.id}`} className="sr-only">New subtask</label>
          <input
            id={`subtask-new-${task.id}`}
            value={title}
            maxLength={TASK_LIMITS.subtaskTitle}
            disabled={full}
            placeholder={full ? `Limit of ${TASK_LIMITS.subtasksPerTask} subtasks reached` : "Add a subtask"}
            onChange={(e) => setTitle(e.target.value)}
            className={`min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 disabled:bg-slate-100 ${FOCUS_LIGHT}`}
          />
          <button type="submit" disabled={!title.trim() || busy || full} className={BUTTON_PRIMARY_COMPACT}>Add</button>
        </form>
      )}
      {locked && <p className="mt-2 text-xs text-slate-700">{lockedReason}</p>}
    </section>
  );
}

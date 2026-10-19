import { useState } from "react";
import { TASK_LABEL_COLORS, TASK_LIMITS, type BoardResponse, type TaskLabelColor } from "@shared/taskTypes";
import { LABEL_CHIP_CLASSES } from "../../lib/tasks/labels";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";

interface Props {
  board: BoardResponse;
  onCreate: (input: { name: string; color: TaskLabelColor }) => Promise<unknown>;
  onClose: () => void;
}

/** Leader-only: the group's labels and a way to add one. Labels are planning tags and never touch a score. */
export function ManageLabelsDialog({ board, onCreate, onClose }: Props) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [name, setName] = useState("");
  const [color, setColor] = useState<TaskLabelColor>("blue");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), color });
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the label.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="manage-labels-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="manage-labels-title" className="text-lg font-semibold text-slate-900">Manage labels</h2>

        {board.labels.length === 0 ? (
          <p className="mt-2 text-sm text-slate-800">No labels yet. Add one below, then use it on any task.</p>
        ) : (
          <ul aria-label="Labels" className="mt-3 flex flex-wrap gap-1.5">
            {board.labels.map((l) => (
              <li key={l.id} className={`inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-xs font-medium ${LABEL_CHIP_CLASSES[l.color]}`}>
                <span className="truncate">{l.name}</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="new-label-name" className="mb-1 block text-sm font-medium text-slate-900">New label</label>
            <input
              id="new-label-name"
              value={name}
              maxLength={TASK_LIMITS.labelName}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              className={`min-h-9 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 ${FOCUS_LIGHT}`}
            />
          </div>
          <div>
            <label htmlFor="new-label-color" className="mb-1 block text-sm font-medium text-slate-900">Color</label>
            <select
              id="new-label-color"
              value={color}
              onChange={(e) => setColor(e.target.value as TaskLabelColor)}
              className={`min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm capitalize text-slate-900 ${FOCUS_LIGHT}`}
            >
              {TASK_LABEL_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-red-800">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Close</button>
            <button type="submit" disabled={!name.trim() || busy} className={BUTTON_PRIMARY_COMPACT}>Add label</button>
          </div>
        </form>
      </div>
    </div>
  );
}

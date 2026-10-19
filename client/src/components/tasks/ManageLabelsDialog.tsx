import { useState } from "react";
import { TASK_LABEL_COLORS, TASK_LIMITS, type BoardLabel, type BoardResponse, type TaskLabelColor } from "@shared/taskTypes";
import { LABEL_CHIP_CLASSES } from "../../lib/tasks/labels";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";

interface Props {
  board: BoardResponse;
  onCreate: (input: { name: string; color: TaskLabelColor }) => Promise<unknown>;
  onRename: (labelId: number, name: string) => Promise<unknown>;
  onDelete: (labelId: number) => Promise<unknown>;
  onClose: () => void;
}

/** Leader-only: the group's labels, with Rename, Delete (after a confirmation) and Add. Labels are planning tags and never touch a score. */
export function ManageLabelsDialog({ board, onCreate, onRename, onDelete, onClose }: Props) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [name, setName] = useState("");
  const [color, setColor] = useState<TaskLabelColor>("blue");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; draft: string } | null>(null);
  const [deleting, setDeleting] = useState<BoardLabel | null>(null);

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

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renaming || busy) return;
    const next = renaming.draft.trim();
    const current = board.labels.find((l) => l.id === renaming.id);
    if (!next || next === current?.name) { setRenaming(null); return; }
    setBusy(true);
    setError("");
    try {
      await onRename(renaming.id, next);
      setRenaming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename the label.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await onDelete(deleting.id);
      setDeleting(null);
    } catch (err) {
      setDeleting(null);
      setError(err instanceof Error ? err.message : "Could not delete the label.");
    } finally {
      setBusy(false);
    }
  }

  const usedBy = (id: number) => board.tasks.filter((t) => t.labelIds.includes(id)).length;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="manage-labels-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
          <h2 id="manage-labels-title" className="text-lg font-semibold text-slate-900">Manage labels</h2>

          {deleting ? (
            <div role="alertdialog" aria-label={`Delete the label "${deleting.name}"?`} className="mt-3 space-y-2 rounded-lg border border-red-300 bg-red-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Delete the label "{deleting.name}"?</p>
              <p className="text-sm text-slate-800">
                {usedBy(deleting.id) > 0
                  ? `It is removed from ${usedBy(deleting.id)} ${usedBy(deleting.id) === 1 ? "task" : "tasks"}. The tasks themselves stay.`
                  : "No task uses it."}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDeleting(null)} disabled={busy} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  disabled={busy}
                  className="inline-flex min-h-8 items-center rounded-lg bg-red-800 px-3 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
                >
                  {busy ? "Deleting…" : "Delete label"}
                </button>
              </div>
            </div>
          ) : board.labels.length === 0 ? (
            <p className="mt-2 text-sm text-slate-800">No labels yet. Add one below, then use it on any task.</p>
          ) : (
            <ul aria-label="Labels" className="mt-3 space-y-1">
              {board.labels.map((l) => (
                <li key={l.id} className="flex min-h-10 flex-wrap items-center gap-2">
                  {renaming?.id === l.id ? (
                    <form onSubmit={saveRename} className="flex flex-1 flex-wrap items-center gap-2">
                      <label htmlFor={`rename-${l.id}`} className="sr-only">New name for {l.name}</label>
                      <input
                        id={`rename-${l.id}`}
                        value={renaming.draft}
                        maxLength={TASK_LIMITS.labelName}
                        autoFocus
                        onChange={(e) => setRenaming({ id: l.id, draft: e.target.value })}
                        className={`min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm text-slate-900 ${FOCUS_LIGHT}`}
                      />
                      <button type="submit" disabled={busy || !renaming.draft.trim()} className={BUTTON_PRIMARY_COMPACT}>Save</button>
                      <button type="button" onClick={() => setRenaming(null)} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className={`inline-flex min-w-0 max-w-[10rem] items-center rounded border px-1.5 py-0.5 text-xs font-medium ${LABEL_CHIP_CLASSES[l.color]}`}>
                        <span className="truncate">{l.name}</span>
                      </span>
                      <span className="ml-auto flex gap-1">
                        <button type="button" onClick={() => { setError(""); setRenaming({ id: l.id, draft: l.name }); }} aria-label={`Rename ${l.name}`} className={BUTTON_SECONDARY_COMPACT}>Rename</button>
                        <button type="button" onClick={() => { setError(""); setDeleting(l); }} aria-label={`Delete ${l.name}`} className={`${BUTTON_SECONDARY_COMPACT} border-red-300 text-red-900`}>Delete</button>
                      </span>
                    </>
                  )}
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

    </>
  );
}

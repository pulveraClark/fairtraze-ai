import { useEffect, useRef, useState } from "react";
import { PlusIcon } from "./icons";
import { FOCUS_LIGHT } from "../ui/styles";

interface Props {
  columnLabel: string;
  /** Resolves when the task is created; throws with a readable message when it is not. */
  onAdd: (title: string) => Promise<void>;
}

/** "+ Add task" at the bottom of a column: title only. Enter adds and keeps the box open; Esc closes. */
export function QuickAdd({ columnLabel, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError("");
    try {
      await onAdd(trimmed);
      setTitle("");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the task.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-2 flex min-h-11 w-full items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-200/60 ${FOCUS_LIGHT}`}
      >
        <PlusIcon className="h-4 w-4" />
        Add task
        <span className="sr-only"> to {columnLabel}</span>
      </button>
    );
  }

  return (
    <div className="mt-2">
      <label className="sr-only" htmlFor={`quick-add-${columnLabel}`}>New task title in {columnLabel}</label>
      <input
        id={`quick-add-${columnLabel}`}
        ref={inputRef}
        value={title}
        maxLength={200}
        disabled={busy}
        placeholder="Task title, then Enter"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void submit(); }
          if (e.key === "Escape") { e.stopPropagation(); setOpen(false); setTitle(""); setError(""); }
        }}
        onBlur={() => { if (!title.trim()) { setOpen(false); setError(""); } }}
        className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-600 ${FOCUS_LIGHT}`}
      />
      {error && <p role="alert" className="mt-1 text-xs font-medium text-red-800">{error}</p>}
    </div>
  );
}

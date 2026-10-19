import { useEffect, useRef, useState } from "react";
import { FOCUS_LIGHT } from "../ui/styles";
import { PlusIcon } from "./icons";

interface Props {
  /** Creates the task. May return a short confirmation to announce ("Added FT-12"). Rejects with a readable message on failure. */
  onAdd: (title: string) => Promise<string | void>;
  /** Names the column in the accessible labels ("To do"). */
  label?: string;
}

/**
 * "+ Add task" that turns into a single title field. Enter creates and keeps the field open for the next one;
 * Esc closes it; blur closes it only when it is empty, so typed text is never lost.
 */
export function QuickAddTask({ onAdd, label }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const refocusButton = useRef(false);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (refocusButton.current) { refocusButton.current = false; buttonRef.current?.focus(); }
  }, [open]);

  function close(returnFocus: boolean) {
    refocusButton.current = returnFocus;
    setTitle("");
    setError("");
    setOpen(false);
  }

  async function submit() {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      const message = await onAdd(value);
      setTitle("");
      setNote(message || "Task added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task.");
    } finally {
      setBusy(false);
      // Keep typing: the field stays focused after the create (it is only read-only-busy, never disabled).
      inputRef.current?.focus();
    }
  }

  const name = label ? `Add a task to ${label}` : "Add a task";

  return (
    <div className="min-w-0">
      {open ? (
        <div>
          <input
            ref={inputRef}
            type="text"
            value={title}
            maxLength={200}
            readOnly={busy}
            aria-label={name}
            aria-invalid={error ? true : undefined}
            placeholder="Add a task…"
            onChange={(e) => { setTitle(e.target.value); setNote(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
              else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
            }}
            onBlur={() => { if (!title.trim() && !busy) close(false); }}
            className={`min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-600 ${FOCUS_LIGHT}`}
          />
          <p className="mt-1 px-1 text-xs text-slate-700">Press Enter to add, Esc to close.</p>
        </div>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label={label ? `Add task to ${label}` : "Add task"}
          onClick={() => { setNote(""); setOpen(true); }}
          className={`inline-flex min-h-10 w-full items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-800 hover:bg-slate-200 ${FOCUS_LIGHT}`}
        >
          <PlusIcon className="h-4 w-4" />
          Add task
        </button>
      )}
      {error && <p role="alert" className="mt-1 px-1 text-sm font-medium text-red-800">{error}</p>}
      <p role="status" className={note ? "mt-1 px-1 text-xs text-slate-700" : "sr-only"}>{note}</p>
    </div>
  );
}

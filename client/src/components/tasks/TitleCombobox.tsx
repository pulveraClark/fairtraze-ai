import { useId, useMemo, useRef, useState } from "react";
import type { TaskSuggestion } from "@shared/taskTypes";
import { FOCUS_LIGHT } from "../ui/styles";

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: TaskSuggestion[];
  onPick: (s: TaskSuggestion) => void;
  maxLength?: number;
  autoFocus?: boolean;
}

const FIELD = `min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 ${FOCUS_LIGHT}`;
const PLACEHOLDER = "Type a title or pick from the project instructions";
const MAX_ROWS = 5;
const ROW_PX = 44;

/**
 * The task Title as a combobox: a normal text box that can also offer "From the project instructions".
 * With no suggestions it is a plain input (no chevron, no list). The list opens on click, the chevron,
 * ArrowDown or typing (never on the dialog's autofocus), filters as you type and closes when nothing matches.
 */
export function TitleCombobox({ id, value, onChange, suggestions, onPick, maxLength, autoFocus }: Props) {
  const hasList = suggestions.length > 0;
  const listId = useId();
  const headId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const q = value.trim().toLowerCase();
    return q ? suggestions.filter((s) => s.text.toLowerCase().includes(q)) : suggestions;
  }, [suggestions, value]);

  const expanded = hasList && open && shown.length > 0;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  function show() { if (hasList) setOpen(true); }
  function close() { setOpen(false); setActive(-1); }
  function pick(s: TaskSuggestion) {
    onPick(s);
    close();
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!expanded) { show(); setActive(0); return; }
      setActive((a) => (a + 1) % shown.length);
    } else if (e.key === "ArrowUp" && expanded) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
    } else if (e.key === "Enter" && expanded && active >= 0) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape" && expanded) {
      // Close the list only; the typed text stays and the dialog's own Esc handler does not run.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        value={value}
        maxLength={maxLength}
        autoFocus={autoFocus}
        placeholder={PLACEHOLDER}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setActive(-1); show(); }}
        onClick={show}
        onKeyDown={onKeyDown}
        onBlur={(e) => { if (!e.relatedTarget || !e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) close(); }}
        {...(hasList
          ? {
              role: "combobox",
              "aria-expanded": expanded,
              "aria-controls": listId,
              "aria-autocomplete": "list" as const,
              ...(expanded && active >= 0 ? { "aria-activedescendant": optionId(active) } : {}),
            }
          : {})}
        className={`${FIELD} ${hasList ? "pr-10" : ""}`}
      />
      {hasList && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show project instructions"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { if (expanded) close(); else { show(); inputRef.current?.focus(); } }}
          className={`absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 ${FOCUS_LIGHT}`}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {hasList && (
        <p className="sr-only" aria-live="polite">
          {expanded ? `${shown.length} ${shown.length === 1 ? "suggestion" : "suggestions"} from the project instructions` : ""}
        </p>
      )}
      {expanded && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-slate-300 bg-white shadow-lg">
          <p id={headId} className="px-3 pt-2 text-xs font-medium text-slate-700">From the project instructions</p>
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={headId}
            className="overflow-y-auto py-1"
            style={{ maxHeight: MAX_ROWS * ROW_PX }}
          >
            {shown.map((s, i) => (
              <li
                key={s.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center px-3 py-1.5 text-lg text-slate-900 ${i === active ? "bg-slate-100" : ""}`}
              >
                {s.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

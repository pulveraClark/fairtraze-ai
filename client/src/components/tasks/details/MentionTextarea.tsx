import { useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MutableRefObject, Ref } from "react";
import type { BoardMember } from "@shared/taskTypes";
import { activeMentionQuery, matchMembers, parseMentions } from "../../../lib/tasks/mentions";
import { FOCUS_LIGHT } from "../../ui/styles";

type Person = Pick<BoardMember, "userId" | "name">;

/**
 * The text the person edits shows "@Name"; what is stored is the <@userId> token. These two convert
 * between them so the stored text stays correct when someone is renamed. Names are matched longest
 * first so "Ana Reyes" wins over "Ana", and only whole names count.
 */
export function displayFromStored(stored: string, members: Person[]): string {
  return parseMentions(stored, members)
    .map((p) => (p.type === "text" ? p.text : p.known ? `@${p.name}` : p.name))
    .join("");
}

export function storedFromDisplay(display: string, members: Person[]): string {
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  let out = display;
  for (const m of sorted) {
    const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, "gu"), `<@${m.userId}>`);
  }
  return out;
}

/** Renders stored text with each mention as a highlighted name (live from the member list). */
export function MentionText({ text, members, className = "" }: { text: string; members: Person[]; className?: string }) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parseMentions(text, members).map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <span key={i} className="rounded bg-indigo-50 px-1 font-medium text-indigo-900">
            {p.known ? `@${p.name}` : p.name}
          </span>
        ),
      )}
    </p>
  );
}

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  members: Person[];
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  onBlur?: () => void;
  /**
   * While the @ list is open this holds a function that closes it. The window's Escape handler calls it
   * first, so Escape closes the list and only a second press closes the window.
   */
  dismissRef?: MutableRefObject<(() => void) | null>;
  inputRef?: Ref<HTMLTextAreaElement>;
  hideLabel?: boolean;
  /** Where the @ list opens. Use "above" for a box at the bottom of a scrolling window. */
  popup?: "above" | "below";
  className?: string;
  describedBy?: string;
}

/** A textarea with @mention autocomplete (group members only). */
export function MentionTextarea({
  id, label, value, onChange, members, rows = 3, maxLength, disabled, placeholder, onSubmit, onBlur,
  dismissRef, inputRef, hideLabel, popup = "below", className = "", describedBy,
}: Props) {
  const listId = useId();
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const options = useMemo(() => (query ? matchMembers(members, query.query) : []), [members, query]);
  const open = query !== null && options.length > 0;

  if (dismissRef) dismissRef.current = open ? () => setQuery(null) : null;

  function refresh(text: string, caret: number) {
    setQuery(activeMentionQuery(text, caret));
    setActive(0);
  }

  function choose(person: Person) {
    const el = localRef.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? value.length;
    // The editable text shows "@Name", so insert the name here; it becomes a token on save.
    const text = value.slice(0, query.start) + `@${person.name} ` + value.slice(caret);
    const nextCaret = query.start + person.name.length + 2;
    onChange(text);
    setQuery(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(nextCaret, nextCaret); });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(options[active]!); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(); }
  }

  return (
    <div className="relative">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-1 block text-sm font-medium text-slate-900"}>{label}</label>
      <textarea
        id={id}
        ref={(el) => {
          localRef.current = el;
          if (typeof inputRef === "function") inputRef(el);
          else if (inputRef) (inputRef as MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }}
        value={value}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        onChange={(e) => { onChange(e.target.value); refresh(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) refresh(value, e.currentTarget.selectionStart ?? 0); }}
        onClick={(e) => refresh(value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => { setQuery(null); onBlur?.(); }}
        className={`w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-700 ${FOCUS_LIGHT} ${className}`}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention a group member"
          className={`absolute left-0 z-20 max-h-48 w-64 overflow-y-auto rounded-lg border border-slate-300 bg-white py-1 shadow-lg ${popup === "above" ? "bottom-full mb-1" : "mt-1"}`}
        >
          {options.map((m, i) => (
            <li
              key={m.userId}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the textarea does not lose focus first.
              onMouseDown={(e) => { e.preventDefault(); choose(m); }}
              className={`min-h-9 cursor-pointer px-3 py-2 text-sm text-slate-900 ${i === active ? "bg-indigo-50 font-medium" : ""}`}
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

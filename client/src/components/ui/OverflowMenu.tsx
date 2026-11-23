import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { usePopover } from "../../hooks/usePopover";
import { FOCUS_LIGHT } from "./styles";

export interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
  /** "danger" is for destructive entries; the text still says what it does. */
  tone?: "default" | "danger";
  disabled?: boolean;
}

interface Props {
  /** Accessible name of the "…" button, e.g. "More task options". */
  label: string;
  items: OverflowMenuItem[];
  /** Which edge of the button the menu lines up with. */
  align?: "left" | "right";
  /** "onColor" is for a button sitting on a colored band (white icon, no border). */
  variant?: "default" | "onColor";
  className?: string;
}

/** A "…" button that opens a small action menu. Esc and outside click close it; arrows move between items. */
export function OverflowMenu({ label, items, align = "right", variant = "default", className = "" }: Props) {
  const { open, setOpen, ref, triggerRef } = usePopover();
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
    buttons[next]!.focus();
  }

  return (
    // Inside a clickable card, neither a click nor Enter/Space on the menu may also open the card.
    // Escape is left alone so the popover's own document listener still closes the menu.
    <div
      className={`relative inline-flex ${className}`}
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}
    >
      <button
        type="button"
        ref={triggerRef}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg ${FOCUS_LIGHT} ${
          variant === "onColor"
            ? "text-white hover:bg-white/20"
            : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className={`absolute top-full z-30 mt-1 min-w-48 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect(); }}
              className={`flex min-h-10 w-full items-center px-3 text-left text-sm hover:bg-slate-50 disabled:opacity-50 ${FOCUS_LIGHT} ${
                item.tone === "danger" ? "font-semibold text-red-800" : "text-slate-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

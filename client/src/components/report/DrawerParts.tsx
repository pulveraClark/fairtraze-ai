import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { FOCUS_LIGHT } from "../ui";

/** Full-width section header button (>=44px) with a title, one-line subtitle and a rotating chevron. */
export function DisclosureSection({
  title, subtitle, open, onToggle, children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section className="border-t border-slate-200">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(!open)}
          className={`flex min-h-11 w-full items-center justify-between gap-3 py-2.5 text-left ${FOCUS_LIGHT}`}
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold leading-snug text-slate-900">{title}</span>
            <span className="block text-xs leading-normal text-slate-700">{subtitle}</span>
          </span>
          <svg
            className={`h-5 w-5 shrink-0 text-slate-700 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </h3>
      {open && (
        <div id={bodyId} role="region" aria-label={title} className="pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

/** (i) button whose dark tooltip shows on hover, focus or click and hides on Escape. */
export function HoverTip({ label, children }: { label: string; children: ReactNode }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const id = useId();
  const show = pinned || hover || focus;

  // While a tooltip is visible (hover, focus or click), Escape dismisses it alone. A capture-phase
  // document listener runs before the drawer's bubble-phase Escape handler and stops the event, so
  // this works even when focus is elsewhere in the drawer.
  useEffect(() => {
    if (!show) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setPinned(false); setHover(false); setFocus(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [show]);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={show ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setFocus(true)}
        onBlur={() => { setFocus(false); setPinned(false); }}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-700 hover:bg-slate-900/10 ${FOCUS_LIGHT}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      {show && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full right-0 z-30 mb-1 w-56 max-w-[70vw] rounded-lg bg-slate-900 p-2.5 text-xs font-normal leading-normal text-white shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}

export function Row({ label, value, tip }: { label: ReactNode; value: ReactNode; tip?: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-sm leading-normal">
      <dt className="min-w-0 text-slate-800">{label}{tip}</dt>
      <dd className="m-0 shrink-0 text-right font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-normal text-slate-700">{children}</p>;
}

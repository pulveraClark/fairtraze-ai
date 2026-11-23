import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { FOCUS_LIGHT } from "../ui";
import { SOURCE_COLOR } from "../../lib/sourceColors";
import type { ShareSegment } from "../../lib/shareSegments";

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
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // The tooltip is drawn in a portal with fixed coordinates so a scrolling column (the member modal's sidebar)
  // can never clip it. It sits above the button, right-aligned, kept inside the viewport, below if there is no room above.
  useLayoutEffect(() => {
    if (!show) { setPos(null); return; }
    function place() {
      const b = btnRef.current?.getBoundingClientRect();
      const t = tipRef.current;
      if (!b || !t) return;
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const left = Math.max(8, Math.min(b.right - w, vw - w - 8));
      const top = b.top - h - 4 >= 8 ? b.top - h - 4 : Math.max(8, Math.min(b.bottom + 4, vh - h - 8));
      setPos({ left, top });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [show]);

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
        ref={btnRef}
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
      {show && createPortal(
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{ position: "fixed", left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
          className="z-[60] w-56 max-w-[70vw] rounded-lg bg-slate-900 p-2.5 text-xs font-normal leading-normal text-white shadow-lg"
        >
          {children}
        </span>,
        document.body
      )}
    </span>
  );
}

export function Row({ label, value, tip, bar }: { label: ReactNode; value: ReactNode; tip?: ReactNode; bar?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 text-sm leading-normal">
      <dt className="min-w-0 text-slate-800">{label}{tip}</dt>
      <dd className="m-0 shrink-0 text-right font-semibold tabular-nums text-slate-900">{value}</dd>
      {bar}
    </div>
  );
}

const clampPct = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);

/**
 * Thin 0-100% bar; the percentage text beside it carries the meaning. `fairPct` adds a tick at the equal share.
 * With `segments` the fill is split into source colors (GitHub / Docs) inside the same track and the bar gets
 * `ariaLabel`; the tick is drawn above the fills with a thin white edge so it stays visible on blue and orange.
 */
export function ShareBar({ pct, fairPct, segments, ariaLabel }: {
  pct: number; fairPct: number | null; segments?: ShareSegment[]; ariaLabel?: string;
}) {
  const split = !!segments;
  return (
    <div
      {...(split ? { role: "img", "aria-label": ariaLabel } : { "aria-hidden": true })}
      data-testid="share-bar"
      className="relative mb-2 mt-0.5 h-1.5 w-full basis-full rounded-full bg-slate-200"
    >
      {segments ? (
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          {segments.map((s) => (
            <div key={s.key} data-testid={`share-bar-${s.key}`} className="h-full shrink-0" style={{ width: `${clampPct(s.pct)}%`, backgroundColor: SOURCE_COLOR[s.key] }} />
          ))}
        </div>
      ) : (
        <div data-testid="share-bar-fill" className="absolute inset-y-0 left-0 rounded-full bg-slate-500" style={{ width: `${clampPct(pct)}%` }} />
      )}
      {fairPct !== null && (
        // Inset by half the tick's width so the tick stays inside the track at 0% and 100%.
        <div className="absolute inset-y-0 inset-x-px">
          <span
            data-testid="share-bar-tick"
            className={`absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-slate-900 ${split ? "ring-1 ring-white" : ""}`}
            style={{ left: `${clampPct(fairPct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-normal text-slate-700">{children}</p>;
}

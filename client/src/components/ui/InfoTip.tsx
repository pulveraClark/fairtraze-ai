import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePopover } from "../../hooks/usePopover";
import { FOCUS_LIGHT } from "./styles";

interface Props {
  /** Accessible name of the (i) button, e.g. "About the Gini coefficient". */
  label: string;
  children: ReactNode;
  /** Optional deep link into the Help page (e.g. "/help#shares"). Adds a small "More in Help" link. */
  helpHref?: string;
}

/** Small (i) button that opens a click-toggled popover; closes on outside click or Esc. */
export function InfoTip({ label, children, helpHref }: Props) {
  const { open, setOpen, ref, triggerRef } = usePopover();
  const id = useId();
  const popRef = useRef<HTMLDivElement>(null);
  // Keep the popover inside the screen: it opens under the button, so near the right edge of a narrow
  // screen it is slid left (or right, near the left edge) by exactly the overflow.
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open || !popRef.current) { setShift(0); return; }
    const r = popRef.current.getBoundingClientRect();
    const margin = 24; // also clears the padding of a dialog that clips its content
    const left = r.left - shift;
    const right = r.right - shift;
    const vw = document.documentElement.clientWidth;
    setShift(right > vw - margin ? vw - margin - right : left < margin ? margin - left : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-700 hover:bg-slate-900/10 ${FOCUS_LIGHT}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          ref={popRef}
          onClick={(e) => { if ((e.target as HTMLElement).closest("button")) { setOpen(false); triggerRef.current?.focus(); } }} // an action inside the tip closes it
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
          role={helpHref ? "group" : "tooltip"}
          aria-label={helpHref ? label : undefined}
          className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-300 bg-white p-3 text-xs font-normal leading-normal text-slate-800 shadow-lg"
        >
          {children}
          {helpHref && (
            // New tab, so help never replaces a form or dialog the reader is in the middle of (e.g. Scoring settings).
            <a
              href={helpHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 block w-fit rounded font-semibold text-indigo-700 underline ${FOCUS_LIGHT}`}
            >
              More in Help
            </a>
          )}
        </div>
      )}
    </span>
  );
}

import { useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";
import { useFocusTrap } from "./useFocusTrap";
import { FOCUS_LIGHT } from "./styles";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** The element that opened the drawer; focus returns here on close. */
  restoreFocusTo?: HTMLElement | null;
}

/** Right-side dialog panel: Esc and backdrop close it, Tab is trapped, focus returns to the opener. */
export function Drawer({ open, onClose, title, subtitle, children, restoreFocusTo }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  useFocusTrap(open, panelRef, onClose, restoreFocusTo);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 print:hidden">
      <div data-testid="drawer-backdrop" className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-y-0 right-0 flex w-[min(28rem,100vw)] flex-col bg-white shadow-2xl ${reduced ? "" : "ft-drawer-right-in"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold leading-snug text-slate-900">{title}</h2>
            {subtitle && <div className="mt-1 text-sm leading-normal text-slate-700">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 ${FOCUS_LIGHT}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}

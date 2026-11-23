import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "./useFocusTrap";
import { FOCUS_LIGHT } from "./styles";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the dialog (the visible heading is `heading`). */
  title: string;
  /** Left side of the header; defaults to the title as an h2. */
  heading?: ReactNode;
  /** Controls placed before the close button (e.g. previous/next). */
  actions?: ReactNode;
  children: ReactNode;
  /**
   * Optional summary column. Above lg it is a 320px grey column on the left (sticky while the body scrolls,
   * with its own scroll only if taller than the dialog); below lg it stacks above `children`.
   */
  sidebar?: ReactNode;
  /** The element that opened the modal; focus returns here on close. */
  restoreFocusTo?: HTMLElement | null;
  /** When this changes the body scrolls back to the top (e.g. another member is shown). */
  scrollKey?: string | number;
  /** Panel width from sm up: sm 28rem (forms, confirmations), md 36rem, lg 1040px (default; detail views). Full screen below sm. */
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-[1040px]" } as const;

/** Centered dialog (full screen under 640px): Esc and backdrop close it, Tab is trapped, focus returns to the opener. */
export function Modal({ open, onClose, title, heading, actions, children, sidebar, restoreFocusTo, scrollKey, size = "lg" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onClose, restoreFocusTo);
  useEffect(() => { bodyRef.current?.scrollTo?.({ top: 0 }); }, [scrollKey]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/60 print:hidden sm:items-center sm:p-4" data-testid="modal-scrim">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" data-testid="modal-backdrop" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[min(92vh,56rem)] ${SIZE_CLASS[size]} sm:rounded-xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            {heading ?? <h2 className="break-words text-lg font-semibold leading-snug text-slate-900">{title}</h2>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 ${FOCUS_LIGHT}`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {sidebar ? (
          // One scroll area for the whole body; the grey column stretches the full height and its content sticks.
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside aria-label="Summary" data-testid="modal-sidebar" className="border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
              <div className="px-4 py-4 sm:px-5 lg:sticky lg:top-0 lg:max-h-[calc(min(92vh,56rem)-5rem)] lg:self-start lg:overflow-y-auto">{sidebar}</div>
            </aside>
            <div data-testid="modal-main" className="min-w-0 px-4 py-4 sm:px-5">{children}</div>
          </div>
        ) : (
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

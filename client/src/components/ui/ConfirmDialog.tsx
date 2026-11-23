import type { ReactNode } from "react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_SECONDARY_COMPACT } from "./styles";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Shown on the confirm button while the action runs, e.g. "Deleting…". */
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small "are you sure?" dialog for destructive actions. Esc and Cancel close it; focus is trapped inside. */
export function ConfirmDialog({ title, children, confirmLabel, busyLabel, busy = false, onConfirm, onCancel }: Props) {
  const ref = useFocusTrap<HTMLDivElement>(onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onCancel}>
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-slate-900">{title}</h2>
        <div id="confirm-body" className="mt-2 text-sm leading-normal text-slate-800">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex min-h-8 items-center rounded-lg bg-red-800 px-3 text-sm font-semibold text-white hover:bg-red-900 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
          >
            {busy ? (busyLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

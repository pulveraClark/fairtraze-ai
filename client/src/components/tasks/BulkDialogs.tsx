import type { BulkSkipped } from "@shared/taskTypes";
import { useRef } from "react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT } from "../ui/styles";

interface ConfirmProps {
  question: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Bulk status and assignee changes cannot be undone, so they ask first. Esc cancels. */
export function BulkConfirmDialog({ question, onConfirm, onCancel }: ConfirmProps) {
  const opener = useRef(document.activeElement as HTMLElement | null); // read before autoFocus moves focus
  const ref = useFocusTrap<HTMLDivElement>(onCancel, () => opener.current?.focus());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="bulk-confirm-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="bulk-confirm-title" className="text-lg font-semibold text-slate-900">{question}</h2>
        <p className="mt-1 text-sm text-slate-700">Each task gets an entry in its history. This cannot be undone in one step.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
          <button type="button" onClick={onConfirm} autoFocus className={BUTTON_PRIMARY_COMPACT}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

interface SkippedProps {
  skipped: BulkSkipped[];
  onClose: () => void;
}

/** Lists the tasks a bulk edit left unchanged, and why. */
export function BulkSkippedDialog({ skipped, onClose }: SkippedProps) {
  const opener = useRef(document.activeElement as HTMLElement | null); // read before autoFocus moves focus
  const ref = useFocusTrap<HTMLDivElement>(onClose, () => opener.current?.focus());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="bulk-skipped-title" className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="bulk-skipped-title" className="text-lg font-semibold text-slate-900">Some tasks were skipped</h2>
        <p className="mt-1 text-sm text-slate-800">These tasks were left as they were. The rest were changed.</p>
        <ul className="mt-3 divide-y divide-slate-200 text-sm">
          {skipped.map((s) => (
            <li key={s.taskId} className="py-2">
              <span className="font-semibold tabular-nums text-slate-900">{s.key}</span>
              <span className="text-slate-800"> · {s.reason}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} autoFocus className={BUTTON_PRIMARY_COMPACT}>Close</button>
        </div>
      </div>
    </div>
  );
}

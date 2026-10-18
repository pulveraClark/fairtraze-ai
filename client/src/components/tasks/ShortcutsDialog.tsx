import { useRef } from "react";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_SECONDARY_COMPACT } from "../ui/styles";

interface Props {
  canCreate: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string[]; what: string; needsCreate?: boolean }[] = [
  { keys: ["C"], what: "Create a task", needsCreate: true },
  { keys: ["/"], what: "Search tasks" },
  { keys: ["J"], what: "Move to the next task (also inside an open task)" },
  { keys: ["K"], what: "Move to the previous task (also inside an open task)" },
  { keys: ["Enter"], what: "Open the task you are on" },
  { keys: ["Esc"], what: "Close a panel or dialog, or clear the selection" },
  { keys: ["?"], what: "Show this list" },
];

/** The keyboard shortcuts for the Tasks tab. Tab stays inside; Esc closes. */
export function ShortcutsDialog({ canCreate, onClose }: Props) {
  const opener = useRef(document.activeElement as HTMLElement | null); // read before autoFocus moves focus
  const ref = useFocusTrap<HTMLDivElement>(onClose, () => opener.current?.focus());
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" className="max-h-full w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <h2 id="shortcuts-title" className="text-lg font-semibold text-slate-900">Keyboard shortcuts</h2>
        <dl className="mt-3 divide-y divide-slate-200 text-sm">
          {SHORTCUTS.filter((s) => !s.needsCreate || canCreate).map((s) => (
            <div key={s.what} className="flex min-h-10 items-center justify-between gap-3 py-1.5">
              <dt className="text-slate-800">{s.what}</dt>
              <dd className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-900">{k}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-slate-700">Shortcuts are off while you type in a field, or when Ctrl, Cmd or Alt is held.</p>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} autoFocus className={BUTTON_SECONDARY_COMPACT}>Close</button>
        </div>
      </div>
    </div>
  );
}

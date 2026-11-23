import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { HF_SLOT_MAX_CHARS, PAGE_TOKEN } from "../lib/headerFooter";
import type { HeaderFooterText } from "../lib/headerFooter";
import { useFocusTrap } from "../lib/useFocusTrap";

interface Props {
  editor: Editor;
  header: HeaderFooterText;
  footer: HeaderFooterText;
  onApply: (next: { header: HeaderFooterText; footer: HeaderFooterText }) => void;
  onClose: () => void;
}

const inputClass =
  "h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600";
const btnClass =
  "min-h-9 rounded border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600";

const SLOTS = [
  { key: "left", label: "Left" },
  { key: "center", label: "Center" },
  { key: "right", label: "Right" },
] as const;

function Band({
  title,
  idPrefix,
  value,
  onChange,
}: {
  title: string;
  idPrefix: string;
  value: HeaderFooterText;
  onChange: (next: HeaderFooterText) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-semibold text-slate-700">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {SLOTS.map((s) => (
          <div key={s.key} className="min-w-0">
            <label htmlFor={`${idPrefix}-${s.key}`} className="mb-1 block text-xs text-slate-700">
              {s.label}
            </label>
            <input
              id={`${idPrefix}-${s.key}`}
              type="text"
              maxLength={HF_SLOT_MAX_CHARS}
              value={value[s.key]}
              onChange={(e) => onChange({ ...value, [s.key]: e.target.value })}
              className={inputClass}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

// Plain-text headers and footers, optional left / center / right, with an optional page number.
// Per-document and shared by the group (a Document column, never the Yjs document). The app adds
// nothing on its own: empty stays empty.
export function HeaderFooterDialog({ editor, header, footer, onApply, onClose }: Props) {
  const [h, setH] = useState<HeaderFooterText>(header);
  const [f, setF] = useState<HeaderFooterText>(footer);
  const dialogRef = useFocusTrap<HTMLFormElement>(onClose, () => { if (!editor.isDestroyed) editor.commands.focus(); });

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ft-hf-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          onApply({ header: h, footer: f });
          onClose();
        }}
      >
        <h2 id="ft-hf-title" className="text-sm font-semibold text-slate-800">Headers and footers</h2>
        <p className="mt-1 text-xs text-slate-600">
          Plain text, shown on every page and in the PDF. Type <span className="font-semibold">{PAGE_TOKEN}</span> where the page
          number should appear. Leave a box empty to show nothing. Up to {HF_SLOT_MAX_CHARS} characters each.
        </p>
        <div className="mt-3 space-y-4">
          <Band title="Header" idPrefix="ft-hf-header" value={h} onChange={setH} />
          <Band title="Footer" idPrefix="ft-hf-footer" value={f} onChange={setF} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btnClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            Cancel
          </button>
          <button type="submit" className={`${btnClass} border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800`}>
            Apply
          </button>
        </div>
      </form>
    </div>
  );
}

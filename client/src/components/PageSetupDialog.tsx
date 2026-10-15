import { useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  MARGIN_PRESETS,
  MARGIN_PRESET_KEYS,
  PAGE_ORIENTATIONS,
  PAGE_SIZES,
  PAGE_SIZE_KEYS,
} from "@shared/pageSizes";
import type { MarginPresetKey, PageOrientation, PageSizeKey } from "@shared/pageSizes";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { PageSetup } from "../lib/pageSetup";

interface Props {
  editor: Editor;
  value: PageSetup;
  onApply: (next: Partial<Pick<PageSetup, "pageSize" | "orientation" | "marginPreset">>) => void;
  onClose: () => void;
}

const ORIENTATION_LABEL: Record<PageOrientation, string> = { PORTRAIT: "Portrait", LANDSCAPE: "Landscape" };

const btnClass =
  "min-h-9 rounded border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600";

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-semibold text-slate-700">{legend}</legend>
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o.key} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1.5 text-sm text-slate-800 hover:bg-indigo-50">
            <input
              type="radio"
              name={name}
              checked={value === o.key}
              onChange={() => onChange(o.key)}
              className="h-4 w-4 accent-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Page setup: paper, orientation, margins. Shared by every collaborator and stored on the Document
// row (never in the Yjs document), so it adds no characters to anyone's authorship count.
export function PageSetupDialog({ editor, value, onApply, onClose }: Props) {
  const [pageSize, setPageSize] = useState<PageSizeKey>(value.pageSize);
  const [orientation, setOrientation] = useState<PageOrientation>(value.orientation);
  const [margins, setMargins] = useState<MarginPresetKey>(value.marginPreset);
  const dialogRef = useFocusTrap<HTMLFormElement>(onClose, () => editor.commands.focus());

  const apply = () => {
    onApply({ pageSize, orientation, marginPreset: margins });
    onClose();
  };

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
        aria-labelledby="ft-page-setup-title"
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <h2 id="ft-page-setup-title" className="text-sm font-semibold text-slate-800">Page setup</h2>
        <p className="mt-1 text-xs text-slate-600">Applies to the page view and the PDF for everyone in the group.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <RadioGroup
            legend="Paper size"
            name="ft-paper"
            options={PAGE_SIZE_KEYS.map((k) => ({ key: k, label: PAGE_SIZES[k].label }))}
            value={pageSize}
            onChange={setPageSize}
          />
          <RadioGroup
            legend="Orientation"
            name="ft-orientation"
            options={PAGE_ORIENTATIONS.map((k) => ({ key: k, label: ORIENTATION_LABEL[k] }))}
            value={orientation}
            onChange={setOrientation}
          />
          <RadioGroup
            legend="Margins"
            name="ft-margins"
            options={MARGIN_PRESET_KEYS.map((k) => ({ key: k, label: MARGIN_PRESETS[k].label }))}
            value={margins}
            onChange={setMargins}
          />
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

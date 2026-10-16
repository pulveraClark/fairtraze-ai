import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  MARGIN_MAX_IN,
  MARGIN_MIN_IN,
  MARGIN_PRESET_KEYS,
  MARGIN_PRESET_LABELS,
  MARGIN_STEP_IN,
  PAGE_ORIENTATIONS,
  PAGE_SIZES,
  PAGE_SIZE_KEYS,
  resolveMargins,
  validateMargins,
} from "@shared/pageSizes";
import type { MarginPresetKey, MarginsIn, PageOrientation, PageSizeKey } from "@shared/pageSizes";
import { useFocusTrap } from "../lib/useFocusTrap";
import type { PageSetup, PageSetupChange } from "../lib/pageSetup";

interface Props {
  editor: Editor;
  value: PageSetup;
  onApply: (next: PageSetupChange) => void;
  onClose: () => void;
}

const ORIENTATION_LABEL: Record<PageOrientation, string> = { PORTRAIT: "Portrait", LANDSCAPE: "Landscape" };
type Side = keyof MarginsIn;
const SIDES: { key: Side; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
];

const btnClass =
  "min-h-9 rounded border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50";

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

const asText = (n: number) => String(Math.round(n * 100) / 100);

// Page setup: paper, orientation, margins. Shared by every collaborator and stored on the Document
// row (never in the Yjs document), so it adds no characters to anyone's authorship count.
export function PageSetupDialog({ editor, value, onApply, onClose }: Props) {
  const [pageSize, setPageSize] = useState<PageSizeKey>(value.pageSize);
  const [orientation, setOrientation] = useState<PageOrientation>(value.orientation);
  const [preset, setPreset] = useState<MarginPresetKey>(value.marginPreset);
  // The boxes hold text so a half-typed value ("0.") is not rewritten under the user's fingers.
  const [boxes, setBoxes] = useState<Record<Side, string>>({
    top: asText(value.margins.top),
    bottom: asText(value.margins.bottom),
    left: asText(value.margins.left),
    right: asText(value.margins.right),
  });
  const dialogRef = useFocusTrap<HTMLFormElement>(onClose, () => { if (!editor.isDestroyed) editor.commands.focus(); });

  const margins: MarginsIn = useMemo(
    () => ({
      top: boxes.top.trim() === "" ? Number.NaN : Number(boxes.top),
      bottom: boxes.bottom.trim() === "" ? Number.NaN : Number(boxes.bottom),
      left: boxes.left.trim() === "" ? Number.NaN : Number(boxes.left),
      right: boxes.right.trim() === "" ? Number.NaN : Number(boxes.right),
    }),
    [boxes]
  );
  const error = validateMargins({
    size: pageSize,
    orientation,
    margins,
    hasHeader: !!(value.header.left || value.header.center || value.header.right),
    hasFooter: !!(value.footer.left || value.footer.center || value.footer.right),
  });

  const pickPreset = (key: MarginPresetKey) => {
    setPreset(key);
    if (key !== "CUSTOM") {
      const m = resolveMargins(key);
      setBoxes({ top: asText(m.top), bottom: asText(m.bottom), left: asText(m.left), right: asText(m.right) });
    }
  };
  const editBox = (side: Side, text: string) => {
    setBoxes((b) => ({ ...b, [side]: text }));
    setPreset("CUSTOM"); // editing a box switches to Custom
  };

  const apply = () => {
    if (error) return;
    onApply({ pageSize, orientation, marginPreset: preset, margins });
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
        <p className="mt-1 text-xs text-slate-600">Applies to the page view, the PDF and the .docx for everyone in the group.</p>
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
            options={MARGIN_PRESET_KEYS.map((k) => ({ key: k, label: MARGIN_PRESET_LABELS[k] }))}
            value={preset}
            onChange={pickPreset}
          />
        </div>

        <fieldset className="mt-4">
          <legend className="mb-1 text-xs font-semibold text-slate-700">Margin sizes (inches)</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SIDES.map((s) => (
              <label key={s.key} className="flex flex-col gap-1 text-xs text-slate-700">
                {s.label}
                <input
                  type="number"
                  inputMode="decimal"
                  min={MARGIN_MIN_IN}
                  max={MARGIN_MAX_IN}
                  step={MARGIN_STEP_IN}
                  value={boxes[s.key]}
                  onChange={(e) => editBox(s.key, e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "ft-margin-error" : "ft-margin-hint"}
                  className="min-h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm tabular-nums text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 aria-[invalid=true]:border-red-700"
                />
              </label>
            ))}
          </div>
          {error ? (
            <p id="ft-margin-error" role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-800">
              <span aria-hidden="true">⚠</span>
              <span>
                <span className="font-semibold">Cannot apply: </span>
                {error}
              </span>
            </p>
          ) : (
            <p id="ft-margin-hint" className="mt-2 text-xs text-slate-600">
              0 to 3 in in steps of 0.1. At least 2 in of writing space must remain in width and height.
            </p>
          )}
        </fieldset>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={`${btnClass} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
            Cancel
          </button>
          <button type="submit" disabled={!!error} className={`${btnClass} border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800`}>
            Apply
          </button>
        </div>
      </form>
    </div>
  );
}

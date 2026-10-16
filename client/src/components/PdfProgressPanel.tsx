interface Props {
  purpose: "download" | "print";
  /** 0..1 */
  fraction: number;
  label: string;
  onCancel: () => void;
}

// Shown while the PDF is built (Download PDF and Print). The work runs in small slices and in a
// worker, so the page stays usable; Cancel stops it and nothing is downloaded or opened.
export function PdfProgressPanel({ purpose, fraction, label, onCancel }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 border-b border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-slate-800"
    >
      <span className="font-semibold">{purpose === "print" ? "Preparing PDF for printing" : "Preparing PDF"}</span>
      <span className="tabular-nums text-slate-700">{label}</span>
      <div
        className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-indigo-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="PDF progress"
      >
        <div className="h-full bg-indigo-700 transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right font-semibold tabular-nums">{pct}%</span>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-8 rounded border border-slate-400 bg-white px-3 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"
      >
        Cancel
      </button>
    </div>
  );
}

import type { ProjectSummaryItem } from "@shared/types";

interface Props {
  assignmentLabel: string;
  items: ProjectSummaryItem[];
  onClick: () => void;
  edpCode?: string;
  classType?: "LECTURE" | "LABORATORY";
  onDelete?: () => void;
}

// Deterministic gradient based on label string — stable across renders
const BAND_GRADIENTS = [
  "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)",
  "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)",
  "linear-gradient(135deg, #be123c 0%, #f43f5e 100%)",
  "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #0369a1 0%, #38bdf8 100%)",
];

function pickGradient(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return BAND_GRADIENTS[h % BAND_GRADIENTS.length];
}

export function parseClassLabel(label: string): { code: string; subjectName: string } {
  const sep = label.indexOf(" — ");
  if (sep === -1) return { code: label, subjectName: "" };
  return { code: label.slice(0, sep), subjectName: label.slice(sep + 3) };
}

export function classAtRiskCount(items: ProjectSummaryItem[]): number {
  return items.filter(
    (i) =>
      i.isAnalyzed &&
      (i.teamHealth === "High Risk" ||
        i.teamHealth === "Moderate Risk" ||
        i.flagsPresent.length > 0)
  ).length;
}

export function ClassCard({ assignmentLabel, items, onClick, edpCode, classType, onDelete }: Props) {
  const { code, subjectName } = parseClassLabel(assignmentLabel);

  const analyzed   = items.filter((i) => i.isAnalyzed);
  const healthy    = analyzed.filter((i) => i.teamHealth === "Healthy").length;
  const moderate   = analyzed.filter((i) => i.teamHealth === "Moderate Risk").length;
  const highRisk   = analyzed.filter((i) => i.teamHealth === "High Risk").length;
  const unanalyzed = items.filter((i) => !i.isAnalyzed).length;
  const atRisk     = classAtRiskCount(items);

  const gradient = pickGradient(assignmentLabel);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="group cursor-pointer w-full text-left bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {/* Colored band */}
      <div
        className="relative px-5 pt-5 pb-4 flex flex-col gap-3"
        style={{ background: gradient }}
      >
        <div className="flex items-start justify-between gap-2">
          {/* Clipboard icon */}
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>

          <div className="flex items-center gap-1.5">
            {atRisk > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/25 border border-white/30 text-white text-[11px] font-semibold whitespace-nowrap">
                ⚠ {atRisk} at risk
              </span>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                title="Delete class section"
                className="p-1 rounded text-white/50 hover:text-white hover:bg-white/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Subject code · EDP code */}
        <div>
          <p className="text-white font-mono font-bold text-lg leading-tight tracking-tight">
            {code}
            {edpCode && (
              <span className="font-semibold text-white/75"> · EDP {edpCode}</span>
            )}
          </p>
          {classType && (
            <p className="text-white/60 text-[11px] font-mono mt-0.5">
              {classType.charAt(0) + classType.slice(1).toLowerCase()}
            </p>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Subject name + BSIT badge */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-indigo-700 transition-colors">
            {subjectName || code}
          </p>
          <span className="shrink-0 text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase">
            BSIT
          </span>
        </div>

        {/* Group count */}
        <p className="text-xs text-slate-500">
          {items.length} group{items.length !== 1 ? "s" : ""}
        </p>

        {/* Risk rollup */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {highRisk > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-red-600 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
              {highRisk} High Risk
            </span>
          )}
          {moderate > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              {moderate} Moderate
            </span>
          )}
          {healthy > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              {healthy} Healthy
            </span>
          )}
          {unanalyzed > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
              {unanalyzed} Not analyzed
            </span>
          )}
        </div>

        {/* Footer arrow */}
        <div className="flex justify-end pt-1">
          <span className="text-xs text-slate-400 group-hover:text-indigo-500 transition-colors">
            View groups →
          </span>
        </div>
      </div>
    </div>
  );
}

import type { ProjectSummaryItem } from "@shared/types";
import { GroupSummaryCard } from "./GroupSummaryCard";

interface Props {
  assignmentLabel: string;
  items: ProjectSummaryItem[];
  expanded: boolean;
  onToggle: () => void;
  onAnalyze: (projectId: number) => void;
  analyzingIds: Set<number>;
}

// Parse "CODE — Subject Name" into its two parts.
function parseLabel(label: string): { code: string; subjectName: string } {
  const sep = label.indexOf(" — ");
  if (sep === -1) return { code: label, subjectName: "" };
  return { code: label.slice(0, sep), subjectName: label.slice(sep + 3) };
}

function isAtRisk(item: ProjectSummaryItem): boolean {
  return (
    item.isAnalyzed &&
    (item.teamHealth === "High Risk" ||
      item.teamHealth === "Moderate Risk" ||
      item.flagsPresent.length > 0)
  );
}

function getRollup(items: ProjectSummaryItem[]) {
  const analyzed = items.filter((i) => i.isAnalyzed);
  return {
    total:        items.length,
    unanalyzed:   items.filter((i) => !i.isAnalyzed).length,
    healthy:      analyzed.filter((i) => i.teamHealth === "Healthy").length,
    moderate:     analyzed.filter((i) => i.teamHealth === "Moderate Risk").length,
    highRisk:     analyzed.filter((i) => i.teamHealth === "High Risk").length,
    needsAttention: items.filter(isAtRisk).length,
  };
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 text-slate-400 ${expanded ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function ClassContainerCard({
  assignmentLabel,
  items,
  expanded,
  onToggle,
  onAnalyze,
  analyzingIds,
}: Props) {
  const { code, subjectName } = parseLabel(assignmentLabel);
  const rollup = getRollup(items);
  const hasAtRisk = rollup.needsAttention > 0;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm overflow-hidden mb-4 border ${
        hasAtRisk ? "border-amber-200" : "border-slate-200"
      }`}
    >
      {/* Clickable header */}
      <button
        onClick={onToggle}
        className="w-full text-left px-6 py-4 flex items-start justify-between gap-4 hover:bg-slate-50/60 transition-colors"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          {/* Subject code + name + group count */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-bold text-indigo-600 tracking-wide">
              {code}
            </span>
            {subjectName && (
              <>
                <span className="text-slate-300 text-xs select-none">—</span>
                <span className="text-sm font-semibold text-slate-700">{subjectName}</span>
              </>
            )}
            <span className="text-xs text-slate-400 ml-1">
              · {rollup.total} group{rollup.total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Risk roll-up */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {rollup.highRisk > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                {rollup.highRisk} High Risk
              </span>
            )}
            {rollup.moderate > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
                {rollup.moderate} Moderate Risk
              </span>
            )}
            {rollup.healthy > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                {rollup.healthy} Healthy
              </span>
            )}
            {rollup.unanalyzed > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300 inline-block" />
                {rollup.unanalyzed} Not analyzed
              </span>
            )}
          </div>
        </div>

        {/* Right side: attention badge + chevron */}
        <div className="flex items-center gap-3 shrink-0 pt-0.5">
          {hasAtRisk && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[11px] font-semibold text-red-700 whitespace-nowrap">
              ⚠ {rollup.needsAttention} need{rollup.needsAttention !== 1 ? "" : "s"} attention
            </span>
          )}
          <ChevronIcon expanded={expanded} />
        </div>
      </button>

      {/* Accordion body */}
      {expanded && (
        <div className="border-t border-slate-100 px-6 pt-4 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <GroupSummaryCard
                key={item.projectId}
                item={item}
                onAnalyze={onAnalyze}
                analyzing={analyzingIds.has(item.projectId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

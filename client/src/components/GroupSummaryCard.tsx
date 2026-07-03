import type { ProjectSummaryItem, Flag, TeamHealth } from "@shared/types";
import { ContributionMiniBar } from "./ContributionMiniBar";
import { useRouter } from "../router";

const HEALTH_BADGE: Record<TeamHealth, string> = {
  Healthy:         "bg-emerald-100 text-emerald-800 border border-emerald-300",
  "Moderate Risk": "bg-amber-100 text-amber-800 border border-amber-300",
  "High Risk":     "bg-red-100 text-red-800 border border-red-300",
};

const FLAG_CHIP: Record<Flag, string> = {
  inactive:          "bg-red-100 text-red-700 border border-red-200",
  "free-rider":      "bg-red-100 text-red-700 border border-red-200",
  overload:          "bg-orange-100 text-orange-700 border border-orange-200",
  "deadline-driven": "bg-yellow-100 text-yellow-700 border border-yellow-200",
};

interface Props {
  item: ProjectSummaryItem;
  onAnalyze?: (projectId: number) => void;
  analyzing: boolean;
  onManage?: (projectId: number) => void;
}

function isMembershipStale(item: ProjectSummaryItem): boolean {
  if (!item.membershipChangedAt || !item.lastAnalyzedAt) return false;
  return new Date(item.membershipChangedAt) > new Date(item.lastAnalyzedAt);
}

export function GroupSummaryCard({ item, onAnalyze, analyzing, onManage }: Props) {
  const { navigate } = useRouter();
  const stale = isMembershipStale(item);

  function openDetail() {
    navigate(`/project/${item.projectId}`);
  }

  if (!item.isAnalyzed) {
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-xl p-5 flex flex-col gap-3 opacity-80">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-600">{item.groupName}</p>
            <p className="text-xs text-slate-400 mt-0.5">{item.name} · {item.memberCount} members</p>
          </div>
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400 border border-slate-200">
            Not analyzed
          </span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 w-full" />
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-400">No report yet</p>
          <div className="flex items-center gap-3">
            {onManage && (
              <button
                onClick={(e) => { e.stopPropagation(); onManage(item.projectId); }}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
              >
                Manage
              </button>
            )}
            <button
              onClick={openDetail}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {onAnalyze ? "Analyze →" : "View →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-3 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer group"
      onClick={openDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && openDetail()}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors">
            {item.groupName}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{item.name} · {item.memberCount} members</p>
        </div>
        {item.teamHealth && (
          <span
            className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${HEALTH_BADGE[item.teamHealth]}`}
          >
            {item.teamHealth}
          </span>
        )}
      </div>

      {/* Contribution mini bar */}
      <ContributionMiniBar memberShares={item.memberShares} />

      {/* Member legend — first 4, then overflow count */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {item.memberShares.slice(0, 4).map((m) => (
          <span key={m.studentName} className="text-xs text-slate-500">
            {m.studentName.split(" ")[0]}: {(m.contributionShare * 100).toFixed(0)}%
          </span>
        ))}
        {item.memberShares.length > 4 && (
          <span className="text-xs text-slate-400">+{item.memberShares.length - 4} more</span>
        )}
      </div>

      {/* Flag chips */}
      {item.flagsPresent.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.flagsPresent.map((flag) => (
            <span
              key={flag}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${FLAG_CHIP[flag]}`}
            >
              {flag}
            </span>
          ))}
        </div>
      )}

      {/* Stale membership prompt */}
      {stale && (
        <div
          className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[11px] text-amber-800 font-medium leading-snug">
              Membership changed — re-analyze to update the report
            </p>
          </div>
          {onAnalyze && (
            <button
              onClick={(e) => { e.stopPropagation(); onAnalyze(item.projectId); }}
              disabled={analyzing}
              className="shrink-0 text-[11px] font-semibold text-amber-700 hover:text-amber-900 transition-colors disabled:opacity-40"
            >
              {analyzing ? "Analyzing…" : "Re-analyze →"}
            </button>
          )}
        </div>
      )}

      {/* Footer: Gini + date + actions */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 gap-2">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {item.gini !== null && (
            <span>
              Gini: <span className="font-semibold text-slate-600">{item.gini.toFixed(3)}</span>
            </span>
          )}
          {item.lastAnalyzedAt && (
            <span>{new Date(item.lastAnalyzedAt).toLocaleDateString()}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {onManage && (
            <button
              onClick={(e) => { e.stopPropagation(); onManage(item.projectId); }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Manage
            </button>
          )}
          {onAnalyze && (
            <button
              onClick={(e) => { e.stopPropagation(); onAnalyze?.(item.projectId); }}
              disabled={analyzing}
              className="text-xs text-slate-400 hover:text-indigo-600 transition-colors disabled:opacity-40"
              title="Re-analyze this project"
            >
              {analyzing ? "Analyzing…" : "Re-analyze"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

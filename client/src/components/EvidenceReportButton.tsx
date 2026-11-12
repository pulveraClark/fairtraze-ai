import { useRouter } from "../router";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";

/**
 * "Print evidence report" on the student group page. Without a stored analysis the button is
 * disabled and the reason is visible text beside it (not only a tooltip), so nobody has to guess.
 */
export function EvidenceReportButton({ projectId, hasReport }: { projectId: number; hasReport: boolean }) {
  const { navigate } = useRouter();
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={!hasReport}
        aria-describedby={hasReport ? undefined : `evidence-none-${projectId}`}
        onClick={() => navigate(`/group/${projectId}/evidence`)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:border-slate-300 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-slate-600 disabled:hover:border-slate-200"
      >
        Print evidence report
      </button>
      <InfoTip label="About the evidence report" helpHref={helpLink("roles")}>{TIPS.evidenceReport}</InfoTip>
      {!hasReport && (
        <span id={`evidence-none-${projectId}`} className="text-xs text-slate-700">No analysis yet.</span>
      )}
    </div>
  );
}

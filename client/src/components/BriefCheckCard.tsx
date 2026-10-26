import { FOCUS_LIGHT } from "./ui";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import { formatBasedOn, type AiBriefCheck } from "../lib/aiReview";

// "Brief check - AI review, may be wrong". Shown to the instructor and the group leader only (the server
// decides; this file never filters by role). It says whether each requirement of the brief is present in
// the group's work. It is not a grade, a score or a judgment of quality.

export const NOTHING_FOUND_LINE = "No brief requirements were found in the group's work yet.";

const STATUS: Record<AiBriefCheck["requirements"][number]["status"], { label: string; icon: string; cls: string }> = {
  FOUND: { label: "Found", icon: "✓", cls: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  PARTLY_FOUND: { label: "Partly found", icon: "◐", cls: "border-amber-300 bg-amber-50 text-amber-950" },
  NOT_FOUND: { label: "Not found", icon: "○", cls: "border-slate-300 bg-slate-100 text-slate-900" },
};

export function BriefCheckCard({ check, instructor = false }: { check: AiBriefCheck; instructor?: boolean }) {
  const when = formatBasedOn(check.generatedAt);
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white">
      <summary className={`flex min-h-10 cursor-pointer flex-wrap items-center gap-x-2 px-3 py-2 text-sm font-semibold text-slate-900 ${FOCUS_LIGHT}`}>
        Brief check · AI review, may be wrong
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
        <p className="flex items-center gap-1 text-xs leading-normal text-slate-700">
          Whether each requirement of the brief is present in the group's work. Not a grade and not a judgment of quality.
          <InfoTip label="About the brief check" helpHref={helpLink("ai")}>{TIPS.briefCheck}</InfoTip>
        </p>
        {check.nothingFound && <p role="status" className="text-sm font-medium leading-normal text-slate-900">{NOTHING_FOUND_LINE}</p>}
        <ul className="space-y-3">
          {check.requirements.map((r, i) => {
            const s = STATUS[r.status];
            return (
              <li key={i} className="min-w-0 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
                  <span aria-hidden="true">{s.icon}</span>
                  {s.label}
                </span>
                <p className="mt-1 text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{r.text}</p>
                {r.unverified && <p className="mt-1 text-xs text-slate-700">No evidence could be checked for this one.</p>}
                {r.evidence.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {r.evidence.map((e, j) => (
                      <li key={j} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-normal">
                        <p className="text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">
                          {e.type === "file" ? "File" : "Docs section"}: {e.ref}
                        </p>
                        {e.quoteHidden ? (
                          <p className="text-xs text-slate-700">Text written by another member is not shown.</p>
                        ) : e.quote ? (
                          <blockquote className="mt-0.5 border-l-2 border-slate-300 pl-2 text-slate-900 [overflow-wrap:anywhere]">{e.quote}</blockquote>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-normal text-slate-700">
          AI review, may be wrong{when ? `. Written ${when}` : ""}.
          {check.outdated ? " The brief or the analysis has changed since. Generate again to update it." : ""}
        </p>
        {instructor && (check.aiAddressedCount ?? 0) > 0 && (
          <p className="text-xs leading-normal text-slate-700">Some text in the group's work appears to address the AI. It was not used.</p>
        )}
      </div>
    </details>
  );
}

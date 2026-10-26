import { useState } from "react";
import { FOCUS_LIGHT } from "./ui";
import { InfoTip } from "./ui/InfoTip";
import { AiBadge } from "./ui/AiBadge";
import { FileEvidenceLink } from "./ui/ExternalEvidenceLink";
import { DocSectionLink } from "../hooks/useDocSectionLink";
import { TIPS, helpLink } from "../lib/helpText";
import { formatBasedOn, type AiBriefCheck } from "../lib/aiReview";

// "Brief check - AI review, may be wrong". Shown to the instructor and the group leader only (the server
// decides; this file never filters by role). It says whether each requirement of the brief is present in
// the group's work. It is not a grade, a score or a judgment of quality.

export const NOTHING_FOUND_LINE = "No brief requirements were found in the group's work yet.";
export const NO_BRIEF_LINE = "Brief check · no brief added yet";
// `unverified` = the AI said Found/Partly found but none of its quotes could be confirmed in the work it was sent.
export const COULDNT_CHECK_REASON = "The AI's evidence couldn't be confirmed in the work, so this is not counted as found.";
const QUOTE_MAX = 140;

type Req = AiBriefCheck["requirements"][number];
type Kind = "FOUND" | "PARTLY_FOUND" | "NOT_FOUND" | "COULDNT_CHECK";

const STATUS: Record<Kind, { label: string; icon: string; cls: string }> = {
  FOUND: { label: "Found", icon: "✓", cls: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  PARTLY_FOUND: { label: "Partly found", icon: "◐", cls: "border-amber-300 bg-amber-50 text-amber-950" },
  NOT_FOUND: { label: "Not found in the work", icon: "○", cls: "border-slate-300 bg-slate-100 text-slate-900" },
  COULDNT_CHECK: { label: "Couldn't check", icon: "?", cls: "border-slate-300 bg-slate-100 text-slate-900" },
};

// A requirement whose evidence could not be confirmed is shown as "Couldn't check", not as "Not found".
const kindOf = (r: Req): Kind => (r.unverified ? "COULDNT_CHECK" : r.status);

// Attention order: the items the reader may want to look at first.
const ATTENTION: Kind[] = ["PARTLY_FOUND", "NOT_FOUND", "COULDNT_CHECK"];

export function truncateQuote(q: string, max = QUOTE_MAX): string {
  const t = q.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

// Counts that are zero are left out; when everything is found there is one calm sentence instead.
export function summaryLine(counts: Record<Kind, number>, total: number): string {
  if (counts.FOUND === total) return `All ${total} requirement${total === 1 ? "" : "s"} found`;
  const parts: string[] = [];
  if (counts.FOUND) parts.push(`${counts.FOUND} found`);
  if (counts.PARTLY_FOUND) parts.push(`${counts.PARTLY_FOUND} partly found`);
  if (counts.NOT_FOUND) parts.push(`${counts.NOT_FOUND} not found`);
  if (counts.COULDNT_CHECK) parts.push(`${counts.COULDNT_CHECK} couldn't check`);
  return parts.join(" · ");
}

function Pill({ kind }: { kind: Kind }) {
  const s = STATUS[kind];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}

function RequirementRow({ r }: { r: Req }) {
  const kind = kindOf(r);
  // The same file is shown once per row, however many quotes pointed at it.
  const seen = new Set<string>();
  const evidence = r.evidence.filter((e) => {
    if (e.type !== "file") return true;
    if (seen.has(e.ref)) return false;
    seen.add(e.ref);
    return true;
  });
  return (
    <li className="min-w-0 py-2">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <Pill kind={kind} />
        <p className="min-w-0 flex-1 basis-48 text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{r.text}</p>
      </div>
      {kind === "COULDNT_CHECK" && <p className="mt-1 text-xs leading-normal text-slate-700">{COULDNT_CHECK_REASON}</p>}
      {evidence.length > 0 && (
        <details className="mt-1">
          <summary className={`flex min-h-10 cursor-pointer items-center text-xs font-semibold text-indigo-900 underline underline-offset-2 ${FOCUS_LIGHT}`}>See evidence</summary>
          <ul className="space-y-2 pb-1">
            {evidence.map((e, j) => (
              <li key={j} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-normal">
                {e.type === "file" ? (
                  <div className="flex flex-wrap items-center gap-x-1 text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">
                    <span>File:</span>
                    <FileEvidenceLink path={e.ref} href={e.href} isCommit={e.isCommit} />
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-x-1 text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">
                      <span>Docs section:</span>
                      <DocSectionLink heading={e.ref} />
                    </div>
                    {e.quoteHidden ? (
                      <p className="text-xs text-slate-700">Text written by another member is not shown.</p>
                    ) : e.quote ? (
                      <blockquote className="mt-0.5 border-l-2 border-slate-300 pl-2 text-slate-900 [overflow-wrap:anywhere]">{truncateQuote(e.quote)}</blockquote>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function BriefCheckCard({ check, instructor = false }: { check: AiBriefCheck; instructor?: boolean }) {
  const [showFound, setShowFound] = useState(false);
  const when = formatBasedOn(check.generatedAt);
  const total = check.requirements.length;

  if (total === 0) return <p className="mt-4 text-sm leading-normal text-slate-700">{NO_BRIEF_LINE}</p>;

  const counts: Record<Kind, number> = { FOUND: 0, PARTLY_FOUND: 0, NOT_FOUND: 0, COULDNT_CHECK: 0 };
  for (const r of check.requirements) counts[kindOf(r)]++;
  const allFound = counts.FOUND === total;
  const attention = ATTENTION.flatMap((k) => check.requirements.filter((r) => kindOf(r) === k));
  const found = check.requirements.filter((r) => kindOf(r) === "FOUND");

  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white">
      <summary className={`flex min-h-10 cursor-pointer list-none flex-wrap items-center gap-x-2 px-3 py-2 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden ${FOCUS_LIGHT}`}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-700 transition-transform [details[open]>summary_&]:rotate-90" fill="currentColor">
          <path d="M7 4l6 6-6 6V4z" />
        </svg>
        Brief check · AI review, may be wrong
        <AiBadge variant="ai" label="AI explanation" />
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
        <p className="flex items-center gap-1 text-xs leading-normal text-slate-700">
          Whether each requirement of the brief is present in the group's work. Not a grade and not a judgment of quality.
          <InfoTip label="About the brief check" helpHref={helpLink("ai")}>{TIPS.briefCheck}</InfoTip>
        </p>
        {check.nothingFound && <p role="status" className="text-sm font-medium leading-normal text-slate-900">{NOTHING_FOUND_LINE}</p>}
        <p className="text-sm font-semibold leading-normal text-slate-900">{summaryLine(counts, total)}</p>
        {!allFound && attention.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {attention.map((r, i) => <RequirementRow key={i} r={r} />)}
          </ul>
        )}
        {!allFound && found.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showFound}
              aria-controls="brief-found-list"
              onClick={() => setShowFound((v) => !v)}
              className={`inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 ${FOCUS_LIGHT}`}
            >
              {showFound ? "Hide" : "Show"} found requirements ({found.length})
            </button>
            {showFound && (
              <ul id="brief-found-list" className="divide-y divide-slate-100">
                {found.map((r, i) => <RequirementRow key={i} r={r} />)}
              </ul>
            )}
          </>
        )}
        <p className="text-xs leading-normal text-slate-700">
          May be wrong{when ? ` · Based on the analysis of ${when}` : ""}.
          {check.outdated ? " The brief or the analysis has changed since. Generate again to update it." : ""}
        </p>
        {instructor && (check.aiAddressedCount ?? 0) > 0 && (
          <p className="text-xs leading-normal text-slate-700">Some text in the group's work appears to address the AI. It was not used.</p>
        )}
      </div>
    </details>
  );
}

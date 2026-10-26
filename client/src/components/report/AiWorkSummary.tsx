import type { ReactNode } from "react";
import { FOCUS_LIGHT } from "../ui";
import { InfoTip } from "../ui/InfoTip";
import { TIPS, helpLink } from "../../lib/helpText";
import { formatBasedOn, summaryFor, type AiReviewResponse, type AiSummaryView } from "../../lib/aiReview";

// Short, neutral "what this member worked on" text with its evidence. Display only: the server
// decides who receives a summary; this file never filters by role.

function EvidenceDetails({ s }: { s: AiSummaryView }) {
  const { files, docSections, commitCount, otherCommits } = s.evidence;
  const empty = files.length === 0 && docSections.length === 0;
  if (empty) return null;
  return (
    <details className="mt-2 rounded-lg border border-slate-200 bg-white">
      <summary className={`flex min-h-10 cursor-pointer items-center px-3 text-sm font-medium text-slate-900 ${FOCUS_LIGHT}`}>
        See evidence
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-3 py-3 text-sm leading-normal text-slate-800">
        {files.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-700">
              Files changed in {commitCount} commit{commitCount === 1 ? "" : "s"}
            </p>
            <ul className="mt-1 space-y-1">
              {files.map((f) => (
                <li key={f.path} className="flex items-start justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere]">{f.path}</span>
                  <span className="shrink-0 tabular-nums text-xs text-slate-700">+{f.added} / -{f.removed}</span>
                </li>
              ))}
            </ul>
            {otherCommits > 0 && (
              <p className="mt-1 text-xs text-slate-700">
                {otherCommits} older commit{otherCommits === 1 ? "" : "s"} not read.
              </p>
            )}
          </div>
        )}
        {docSections.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-700">Docs sections written in</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {docSections.map((h) => <li key={h} className="[overflow-wrap:anywhere]">{h}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function WorkSummaryBlock({
  summary, data, instructor = false, label,
}: {
  summary: AiSummaryView;
  data: AiReviewResponse;
  /** The instructor is told when a newer analysis exists; members just see the date. */
  instructor?: boolean;
  label?: string;
}) {
  const when = formatBasedOn(data.basedOnReportAt ?? data.generatedAt);
  return (
    <div>
      {label && <p className="text-sm font-semibold text-slate-900">{label}</p>}
      <p className="text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{summary.summary}</p>
      <EvidenceDetails s={summary} />
      <p className="mt-2 text-xs leading-normal text-slate-700">
        {summary.source === "facts"
          ? "AI summary unavailable. This line only lists changed files."
          : `AI summary, may be wrong${when ? `. Based on the analysis of ${when}` : ""}.`}
        {instructor && data.outdated ? " A newer analysis exists." : ""}
      </p>
    </div>
  );
}

/** Instructor: the section at the top of the member details window. Renders nothing when AI review is off. */
export function MemberWorkSummary({
  review, member,
}: {
  review: AiReviewResponse | null;
  member: { userId?: number; githubUsername?: string | null };
}): ReactNode {
  if (!review?.enabled) return null;
  const summary = summaryFor(review, member);
  return (
    <section aria-labelledby="work-summary-title" className="border-t border-slate-200 py-3">
      <h3 id="work-summary-title" className="mb-1.5 flex items-center gap-1 text-base font-semibold leading-snug text-slate-900">
        What this member worked on
        <InfoTip label="About the work summary" helpHref={helpLink("ai")}>{TIPS.workSummary}</InfoTip>
      </h3>
      {review.running && !summary ? (
        <p role="status" className="text-sm leading-normal text-slate-700">Writing work summaries. You can keep using the page.</p>
      ) : summary ? (
        <WorkSummaryBlock summary={summary} data={review} instructor />
      ) : (
        <p className="text-sm leading-normal text-slate-700">
          {review.canGenerate && review.hasReport
            ? "No work summary yet. Use Generate AI explanation & review."
            : "No work summary yet."}
        </p>
      )}
    </section>
  );
}

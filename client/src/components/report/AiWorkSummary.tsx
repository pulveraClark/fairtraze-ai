import type { ReactNode } from "react";
import { FOCUS_LIGHT } from "../ui";
import { BUTTON_SECONDARY } from "../ui/styles";
import { InfoTip } from "../ui/InfoTip";
import { AiBadge } from "../ui/AiBadge";
import { FileEvidenceLink } from "../ui/ExternalEvidenceLink";
import { DocSectionLink } from "../../hooks/useDocSectionLink";
import { TIPS, helpLink } from "../../lib/helpText";
import { aiButtonLabel, aiSourceLine, formatBasedOn, summaryFor, type AiReviewResponse, type AiSummaryView } from "../../lib/aiReview";

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
                <li key={f.path} className="flex flex-wrap items-start justify-between gap-x-3">
                  <FileEvidenceLink path={f.path} href={f.href} isCommit={f.isCommit} more={f.more} />
                  <span className="shrink-0 tabular-nums text-xs text-slate-700 sm:pt-3">+{f.added} / -{f.removed}</span>
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
              {docSections.map((h) => <li key={h} className="[overflow-wrap:anywhere]"><DocSectionLink heading={h} /></li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function WorkSummaryBlock({
  summary, data, instructor = false, label, onRegenerate, sourceType,
}: {
  /** The group's source type (GITHUB / EDITOR / COMBINED); decides what the "Written by AI" line says it read. */
  sourceType?: string | null;
  summary: AiSummaryView;
  data: AiReviewResponse;
  /** The instructor is told when a newer analysis exists; members just see the date. */
  instructor?: boolean;
  label?: string;
  /** Instructor only: the same action as the AI report's button, offered next to the fallback note. */
  onRegenerate?: () => void;
}) {
  const when = formatBasedOn(data.basedOnReportAt ?? data.generatedAt);
  const facts = summary.source === "facts";
  const canRegenerate = instructor && !!data.canGenerate && !!data.hasReport && !!onRegenerate;
  return (
    <div>
      {label && <p className="text-sm font-semibold text-slate-900">{label}</p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <AiBadge variant={facts ? "facts" : "ai"} />
      </p>
      {facts && (
        <p className="mt-1.5 text-xs leading-normal text-slate-700">
          The AI findings couldn't be written right now, so this shows the changed files.
          {canRegenerate && (
            <>
              {" "}
              <button
                type="button"
                onClick={onRegenerate}
                className={`inline-flex min-h-8 items-center rounded px-1 font-semibold text-indigo-800 underline [@media(pointer:coarse)]:min-h-10 ${FOCUS_LIGHT}`}
              >
                Regenerate
              </button>
            </>
          )}
        </p>
      )}
      <p className="mt-1.5 text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{summary.summary}</p>
      <EvidenceDetails s={summary} />
      <p className="mt-2 text-xs leading-normal text-slate-700">
        {facts ? "" : `${aiSourceLine(sourceType)} May be wrong${when ? ` · Based on the analysis of ${when}` : ""}.`}
        {instructor && data.outdated ? `${facts ? "" : " "}A newer analysis exists.` : ""}
      </p>
    </div>
  );
}

/** Instructor: the section at the top of the member details window. Renders nothing when AI review is off. */
export function MemberWorkSummary({
  review, member, onGenerate, generating = false, sourceType,
}: {
  sourceType?: string | null;
  review: AiReviewResponse | null;
  member: { userId?: number; githubUsername?: string | null };
  /** The same action as the AI report's button. The button shows only when the server says this viewer may generate. */
  onGenerate?: () => void;
  generating?: boolean;
}): ReactNode {
  if (!review?.enabled) return null;
  const summary = summaryFor(review, member);
  return (
    <section aria-labelledby="work-summary-title" className="border-t border-slate-200 py-3">
      <h3 id="work-summary-title" className="mb-1.5 flex items-center gap-1 text-base font-semibold leading-snug text-slate-900">
        What this member worked on
        <InfoTip label="About the AI findings" helpHref={helpLink("ai")}>{TIPS.workSummary}</InfoTip>
      </h3>
      {review.running && !summary ? (
        <AiBadge variant="writing" />
      ) : summary ? (
        <WorkSummaryBlock summary={summary} data={review} instructor onRegenerate={onGenerate} sourceType={sourceType} />
      ) : review.canGenerate && review.hasReport && onGenerate ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm leading-normal text-slate-700">No AI findings yet.</p>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className={`${BUTTON_SECONDARY} [@media(pointer:coarse)]:min-h-10`}
          >
            {aiButtonLabel(generating, false)}
          </button>
          <p className="text-xs leading-normal text-slate-700">
            Same as the button in Member contributions. Covers the whole group (about 1 minute).
          </p>
        </div>
      ) : (
        <p className="text-sm leading-normal text-slate-700">No AI findings yet.</p>
      )}
    </section>
  );
}

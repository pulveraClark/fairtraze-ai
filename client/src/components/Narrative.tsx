import ReactMarkdown from "react-markdown";
import { CARD } from "./ui/styles";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import { NARRATIVE_OUTDATED_TEXT } from "../lib/analysisFreshness";
import { WORK_SUMMARY_STATUS_TEXT, aiAddressedLine, aiButtonLabel, formatBasedOn, briefStatusLine, reviewStatusLine, workSummaryState } from "../lib/aiReview";
import { AiBadge } from "./ui/AiBadge";
import { BriefCheckCard } from "./BriefCheckCard";
import type { UseAiReview } from "../hooks/useAiReview";
import { useGenerateAiReport, type AiReportGenerator } from "../hooks/useGenerateAiReport";

interface Props {
  narrative: string | null;
  /** An automatic run changed the results after this text was written. */
  outdated?: boolean;
  projectId: number;
  onNarrativeGenerated: (text: string) => void;
  /** AI work summaries for this group. When on, the Generate button also writes them. */
  review?: UseAiReview;
  /** Shared with the member details window so both buttons are the same action. Built here when absent. */
  generator?: AiReportGenerator;
  /** When the analysis the explanation is based on ran (ISO). Shown in the footer. */
  basedOnAt?: string | null;
}

export function Narrative({ narrative, outdated = false, projectId, onNarrativeGenerated, review, generator, basedOnAt }: Props) {
  const own = useGenerateAiReport(projectId, review, onNarrativeGenerated);
  const { reviewOn, generating, error } = generator ?? own;

  const summaryState = review?.data?.canGenerate ? workSummaryState(review.data) : null;
  const statusLine = reviewStatusLine(review?.data ?? null);
  const addressedLine = aiAddressedLine(review?.data ?? null);
  const briefLine = briefStatusLine(review?.data ?? null);
  const briefCheck = review?.data?.enabled ? review.data.briefCheck : undefined;

  const when = formatBasedOn(basedOnAt);

  return (
    <section aria-labelledby="narrative-title" className={`${CARD} min-w-0 border-l-4 border-l-purple-600 p-4`}>
      {/* Header: the one AI button now lives in Member contributions */}
      <div className="mb-4">
        <h2 id="narrative-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold text-slate-900">
          AI report
          {narrative && !generating && <AiBadge variant="ai" label="AI explanation" />}
        </h2>
        <p className="flex items-center gap-1 text-sm leading-normal text-slate-700">
          Scores computed by formula · explained by AI
          <InfoTip label="About the AI report" helpHref={helpLink("ai")}>{TIPS.narrative}</InfoTip>
        </p>
      </div>

      {/* Work-summary status: one calm line each, only when there is something to say */}
      {summaryState && <p role="status" className="mb-3 text-sm leading-normal text-slate-700">{WORK_SUMMARY_STATUS_TEXT[summaryState]}</p>}
      {review?.error && <p role="alert" className="mb-3 text-sm text-red-800">{review.error}</p>}
      {statusLine && <p role="status" className="mb-3 text-sm leading-normal text-slate-700">{statusLine}</p>}
      {addressedLine && <p className="mb-3 text-sm leading-normal text-slate-700">{addressedLine}</p>}
      {briefLine && <p role="status" className="mb-3 text-sm leading-normal text-slate-700">{briefLine}</p>}

      {/* No narrative yet */}
      {!narrative && !generating && (
        <div className="flex flex-col gap-2 py-2">
          <p className="text-sm leading-normal text-slate-700">
            No AI explanation yet. Use the {aiButtonLabel(false, false, reviewOn)} button in Member contributions above.
          </p>
          {error && (
            <p className="max-w-sm text-sm text-red-800">{error}</p>
          )}
        </div>
      )}

      {/* Loading */}
      {generating && (
        <div role="status" className="flex items-center gap-3 py-6 text-sm text-slate-700">
          <svg
            className="h-5 w-5 shrink-0 text-indigo-700 motion-safe:animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Generating AI explanation…</span>
        </div>
      )}

      {/* Narrative */}
      {narrative && !generating && (
        <>
          {outdated && (
            <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-normal text-amber-950">
              {NARRATIVE_OUTDATED_TEXT}
            </p>
          )}
          <div className="text-sm leading-relaxed text-slate-800 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_p]:mb-0 [&_p]:mt-3 [&_p:first-child]:mt-0 [&_p:not(:first-child)]:pt-3 [&_p:not(:first-child)]:border-t [&_p:not(:first-child)]:border-slate-200">
            <ReactMarkdown>{narrative}</ReactMarkdown>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-800">{error}</p>
          )}
          <p className="mt-4 text-sm italic leading-normal text-slate-700">
            May be wrong{when ? ` · Based on the analysis of ${when}` : ""}. Informational only; it does not assign grades or replace instructor judgment.
          </p>
        </>
      )}
      {briefCheck && !generating && <BriefCheckCard check={briefCheck} instructor />}
    </section>
  );
}

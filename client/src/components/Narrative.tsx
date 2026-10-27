import { useId, useRef, useState } from "react";
import type { TeamHealth } from "@shared/types";
import ReactMarkdown from "react-markdown";
import { BUTTON_SECONDARY, CARD } from "./ui/styles";
import { SkeletonLines, Spinner } from "./ui/Spinner";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import { NARRATIVE_OUTDATED_TEXT } from "../lib/analysisFreshness";
import { AI_SLOW_TEXT, AI_WRITING_HINT, WORK_SUMMARY_STATUS_TEXT, aiAddressedLine, aiButtonLabel, formatBasedOn, briefStatusLine, reviewStatusLine, workSummaryState } from "../lib/aiReview";
import { SparkleIcon } from "./ui/AiBadge";
import { BriefCheckCard, CheckHeaderActions } from "./BriefCheckCard";
import { StatusPill } from "./ui/StatusPill";
import { FOCUS_LIGHT } from "./ui";
import { useAuth } from "../context/AuthContext";
import { useRequirementMarks } from "../hooks/useRequirementMarks";
import { giniBandsText } from "../lib/giniBands";
import { healthSentence, instructionsSummary } from "../lib/aiSummary";
import { PILL, pillLabel } from "../lib/instructionsCheck";
import { RefreshFailedNote } from "./RefreshFailedNote";
import { InstructorInstructionsModal } from "./InstructorInstructionsModal";
import { NO_INSTRUCTIONS_LINE } from "../lib/instructionsCheck";
import type { AiBriefCheck } from "../lib/aiReview";
import type { UseAiReview } from "../hooks/useAiReview";
import { useGenerateAiReport, type AiReportGenerator } from "../hooks/useGenerateAiReport";

interface Props {
  narrative: string | null;
  /** An automatic run changed the results after this text was written. */
  outdated?: boolean;
  projectId: number;
  onNarrativeGenerated: (text: string) => void;
  /** AI findings on each member for this group. When on, the Generate button also writes them. */
  review?: UseAiReview;
  /** Shared with the member details window so both buttons are the same action. Built here when absent. */
  generator?: AiReportGenerator;
  /** When the analysis the explanation is based on ran (ISO). Shown in the footer. */
  basedOnAt?: string | null;
  /** Linked repository, for the project instructions check's "Open the repository" link. */
  repoUrl?: string | null;
  /** The group's source type: hides the Docs link for a GitHub-only group. */
  sourceType?: string | null;
  /** The page that shows (and edits) the project instructions. */
  instructionsHref?: string;
  /** The assignment whose instructions open in a window over the report (loaded only when opened). */
  instructionsAssignmentId?: number;
  /** The code-computed team health; null/absent hides the health line (for example, no recorded activity). */
  teamHealth?: TeamHealth | null;
  /** Shown only inside "Team details". Instructor page only. */
  gini?: number | null;
}

const ROW_BTN = `flex min-h-11 min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50 ${FOCUS_LIGHT}`;

/** A 44px collapsed row with a ▸ marker; `actions` sit on its right (a link or tip can't live inside the button). */
function Disclosure({ title, open, onToggle, buttonRef, actions, children }: {
  title: string; open: boolean; onToggle: () => void; buttonRef?: React.Ref<HTMLButtonElement>; actions?: React.ReactNode; children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 rounded-lg border border-slate-200 bg-white pr-2">
        <button type="button" ref={buttonRef} aria-expanded={open} aria-controls={id} onClick={onToggle} className={ROW_BTN}>
          <span aria-hidden="true" className={`shrink-0 text-slate-700 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
        </button>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-x-2 pl-8 sm:pl-0">{actions}</div>}
      </div>
      {open && <div id={id}>{children}</div>}
    </div>
  );
}

type CardProps = Parameters<typeof BriefCheckCard>[0];

/** Instructions line, "Needs a look" and the check row. Reads the instructor's marks once and shares them. */
function InstructionsSection({ projectId, check, failedNote, ...card }: {
  projectId: number; check: AiBriefCheck; failedNote: React.ReactNode;
} & Omit<CardProps, "check" | "marks" | "instructor" | "embedded">) {
  const { token } = useAuth();
  const marks = useRequirementMarks(projectId, token, "instructor");
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLButtonElement>(null);
  const summary = instructionsSummary(check.requirements, marks.marks);
  const unavailable = !!failedNote;
  const actions = <CheckHeaderActions sources={check.sources} instructionsHref={card.instructionsHref} onViewInstructions={card.onViewInstructions} />;
  if (check.nothingRead) {
    return (
      <div className="mt-3 space-y-2">
        {failedNote}
        <Disclosure title="Project instructions check · nothing could be read" open={open} onToggle={() => setOpen((v) => !v)} buttonRef={rowRef} actions={actions}>
          <BriefCheckCard check={check} instructor marks={marks} embedded {...card} />
        </Disclosure>
      </div>
    );
  }
  if (summary.total === 0) return null;
  return (
    <>
      <p className="mt-3 text-sm font-medium leading-normal text-slate-900">
        {unavailable ? "Instructions check unavailable. Last good result kept." : summary.line}
      </p>
      {summary.look.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-950">Needs a look</p>
          <ul className="mt-1.5 space-y-2">
            {summary.look.map((i) => (
              <li key={i.text} className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${PILL[i.kind].cls}`}>
                  <span aria-hidden="true">{PILL[i.kind].icon}</span>
                  {pillLabel(i.kind, true)}
                </span>
                <span className="min-w-0 flex-1 basis-48 text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{i.text}</span>
              </li>
            ))}
          </ul>
          {summary.more > 0 && (
            <button
              type="button"
              onClick={() => { setOpen(true); rowRef.current?.focus(); }}
              className={`mt-1 inline-flex min-h-10 items-center text-sm font-medium text-blue-800 underline underline-offset-2 ${FOCUS_LIGHT}`}
            >
              +{summary.more} more
            </button>
          )}
        </div>
      )}
      <div className="mt-3 space-y-2">
        {failedNote}
        <Disclosure
          title={`Project instructions check · all ${summary.total}, with proof`}
          open={open}
          onToggle={() => setOpen((v) => !v)}
          buttonRef={rowRef}
          actions={actions}
        >
          <BriefCheckCard check={check} instructor marks={marks} embedded {...card} />
        </Disclosure>
      </div>
    </>
  );
}

export function Narrative({ narrative, outdated = false, projectId, onNarrativeGenerated, review, generator, basedOnAt, repoUrl, sourceType, instructionsHref, instructionsAssignmentId, teamHealth, gini }: Props) {
  // The sentence to mark in the instructions window; null while it is closed.
  const [viewing, setViewing] = useState<{ quote?: string } | null>(null);
  const own = useGenerateAiReport(projectId, review, onNarrativeGenerated);
  const { generating, error, generate, busy, slow, upToDate } = generator ?? own;
  const anyError = error ?? review?.error ?? null;

  const summaryState = review?.data?.canGenerate ? workSummaryState(review.data) : null;
  // "Some AI findings show changed files only..." now sits with the member findings, not in this card.
  const statusLine = review?.data?.status === "PARTIAL" ? null : reviewStatusLine(review?.data ?? null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const addressedLine = aiAddressedLine(review?.data ?? null);
  const briefLine = briefStatusLine(review?.data ?? null);
  const briefCheck = review?.data?.enabled ? review.data.briefCheck : undefined;
  // Instructor only: the server says exactly when the project has no written instructions and no file.
  const noInstructions = !!review?.data?.enabled && !!review.data.canGenerate && review.data.hasInstructions === false;

  const when = formatBasedOn(basedOnAt);

  return (
    <section aria-labelledby="narrative-title" className={`${CARD} min-w-0 border-l-4 border-l-purple-600 p-4`}>
      {/* Header: the one AI button now lives in Member contributions */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h2 id="narrative-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold text-slate-900">
          <span className="text-indigo-800"><SparkleIcon /></span>
          AI findings
        </h2>
        <p className="flex min-w-0 flex-wrap items-center gap-1 text-sm leading-normal text-slate-700">
          Scores computed by formula · explained by AI
          <InfoTip label="About the AI findings" helpHref={helpLink("ai")}>{TIPS.narrative}</InfoTip>
        </p>
      </div>

      {/* Work-summary status: one calm line each, only when there is something to say */}
      {summaryState === "running" ? (
        // Not a live region: the one in Member contributions announces the change.
        <div className="mb-3 min-h-24">
          <p className="flex items-center gap-2 text-sm leading-normal text-slate-700">
            <Spinner className="text-indigo-700" />
            {WORK_SUMMARY_STATUS_TEXT.running}
          </p>
          <p className="mt-1 text-xs leading-normal text-slate-700">{slow ? AI_SLOW_TEXT : AI_WRITING_HINT}</p>
          <SkeletonLines className="mt-3" />
        </div>
      ) : (
        summaryState && WORK_SUMMARY_STATUS_TEXT[summaryState] && (
          <p role="status" className="mb-3 text-sm leading-normal text-slate-700">{WORK_SUMMARY_STATUS_TEXT[summaryState]}</p>
        )
      )}
      {anyError && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-red-800">
          <span className="min-w-0 [overflow-wrap:anywhere]">{anyError}</span>
          <button
            type="button"
            onClick={() => void generate(!!narrative)}
            disabled={busy && !slow}
            className={`${BUTTON_SECONDARY} min-h-10`}
          >
            Try again
          </button>
        </div>
      )}
      {review?.data?.enabled && review.data.refreshFailed?.findings && (
        <RefreshFailedNote
          note={review.data.refreshFailed.findings}
          onTryAgain={review.data.canGenerate ? () => void generate(!!narrative) : undefined}
          busy={busy && !slow}
        />
      )}
      {upToDate && <p role="status" className="mb-3 text-sm leading-normal text-slate-700">{upToDate}</p>}
      {statusLine && <p role="status" className="mb-3 text-sm leading-normal text-slate-700">{statusLine}</p>}
      {addressedLine && <p className="mb-3 text-sm leading-normal text-slate-700">{addressedLine}</p>}
      {briefLine && <p role="status" className="mb-3 text-sm leading-normal text-slate-700">{briefLine}</p>}

      {/* Health: the label is computed by code, so it shows even when the AI text is missing */}
      {teamHealth && (
        <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-normal text-slate-900">
          <StatusPill kind="health" value={teamHealth} />
          <span className="min-w-0">{healthSentence(teamHealth)}</span>
        </p>
      )}

      {/* No narrative yet */}
      {!narrative && !generating && summaryState !== "running" && (
        <div className="flex flex-col gap-2 py-2">
          <p className="text-sm leading-normal text-slate-700">
            No AI findings yet. Use the {aiButtonLabel(false, false)} button in Member contributions above.
          </p>
        </div>
      )}

      {/* Loading */}
      {generating && (
        <div className="min-h-24 py-2 text-sm text-slate-700">
          <p className="flex items-center gap-3">
            <Spinner className="text-indigo-700" />
            <span>Generating AI findings…</span>
          </p>
          {summaryState !== "running" && (
            <>
              <p className="mt-1 text-xs leading-normal text-slate-700">{slow ? AI_SLOW_TEXT : AI_WRITING_HINT}</p>
              <SkeletonLines className="mt-3" />
            </>
          )}
        </div>
      )}

      {/* Instructions line, Needs a look and the check row */}
      {briefCheck && !generating && (
        <InstructionsSection
          projectId={projectId}
          check={briefCheck}
          failedNote={
            review?.data?.refreshFailed?.brief ? (
              <RefreshFailedNote
                note={review.data.refreshFailed.brief}
                onTryAgain={review.data.canGenerate ? () => void generate(!!narrative) : undefined}
                busy={busy && !slow}
              />
            ) : null
          }
          repoUrl={repoUrl}
          sourceType={sourceType}
          instructionsHref={instructionsHref}
          onViewInstructions={instructionsAssignmentId ? (quote) => setViewing({ quote }) : undefined}
        />
      )}

      {/* Team details: the full explanation (with the Gini sentence) and how the label is read */}
      {!generating && (narrative || typeof gini === "number") && (
        <div className="mt-3">
          <Disclosure
            title={`Team details${typeof gini === "number" ? ` · Gini ${gini.toFixed(3)}` : ""}, how the team health is read`}
            open={detailsOpen}
            onToggle={() => setDetailsOpen((v) => !v)}
          >
            <div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
              {outdated && narrative && (
                <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-normal text-amber-950">
                  {NARRATIVE_OUTDATED_TEXT}
                </p>
              )}
              {narrative && (
                <div className="text-sm leading-relaxed text-slate-800 [&_strong]:font-semibold [&_strong]:text-slate-900 [&_p]:mb-0 [&_p]:mt-3 [&_p:first-child]:mt-0 [&_p:not(:first-child)]:pt-3 [&_p:not(:first-child)]:border-t [&_p:not(:first-child)]:border-slate-200">
                  <ReactMarkdown>{narrative}</ReactMarkdown>
                </div>
              )}
              <p className="text-xs leading-normal text-slate-700">{giniBandsText()}</p>
            </div>
          </Disclosure>
        </div>
      )}
      {narrative && !generating && outdated && !detailsOpen && (
        <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-normal text-amber-950">
          {NARRATIVE_OUTDATED_TEXT}
        </p>
      )}
      {narrative && !generating && (
        <p className="mt-4 text-sm italic leading-normal text-slate-700">
          May be wrong{when ? ` · Based on the analysis of ${when}` : ""}. Informational only; it does not assign grades or replace instructor judgment.
        </p>
      )}
      {viewing && instructionsAssignmentId && (
        <InstructorInstructionsModal
          assignmentId={instructionsAssignmentId}
          quote={viewing.quote}
          editHref={instructionsHref}
          onClose={() => setViewing(null)}
        />
      )}
      {noInstructions && !briefCheck && !generating && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 text-sm leading-normal text-slate-700">
          <span>{NO_INSTRUCTIONS_LINE}</span>
          {instructionsHref && (
            <a href={instructionsHref} className="inline-flex min-h-10 items-center font-medium text-blue-800 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              Add the instructions
            </a>
          )}
        </p>
      )}
    </section>
  );
}

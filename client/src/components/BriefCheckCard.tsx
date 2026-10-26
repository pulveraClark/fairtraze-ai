import { useState } from "react";
import { FOCUS_LIGHT } from "./ui";
import { InfoTip } from "./ui/InfoTip";
import { AiBadge } from "./ui/AiBadge";
import { FileEvidenceLink } from "./ui/ExternalEvidenceLink";
import { DocSectionLink, DocsTabLink, useOpenDocSection } from "../hooks/useDocSectionLink";
import { TIPS, helpLink } from "../lib/helpText";
import { formatBasedOn, type AiBriefCheck } from "../lib/aiReview";
import {
  ATTENTION_ORDER, NOTHING_READ_TITLE, PILL, SCANNED_NOTE, SKIPPED_NOT_CHECKED, comparedSentence, countKinds, coveredSentence,
  coveredToggleLabel, droppedSentence, highlightHash, kindOf, nothingReadAdvice, otherCountsSentence, pillLabel, readLine, skippedLine,
  type RequirementKind,
} from "../lib/instructionsCheck";

// "Project instructions check" with the AI findings badge. Shown to the instructor and the group leader only
// (the server decides; this file never filters by role). It says whether each requirement of the project
// instructions is covered in the group's work. It is not a grade, a score or a judgment of quality.

// The AI said yes but none of its proof could be found in the work (instructor), or it found no proof (leader).
export const CHECK_WHY = "The AI said yes, but the proof it gave could not be found in the work.";
export const NOT_CLEAR_WHY = "The AI could not find proof of it. If your group did it, make sure it is in the Docs or the repository.";
export const CHECK_WORK_LINE = "Please check the group's work for this one.";
const QUOTE_MAX = 140;

type Req = AiBriefCheck["requirements"][number];

export function truncateQuote(q: string, max = QUOTE_MAX): string {
  const t = q.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

const LINK_CLS = `inline-flex min-h-10 min-w-0 max-w-full items-center text-sm font-medium text-blue-800 underline decoration-blue-800/40 underline-offset-2 hover:decoration-blue-800 ${FOCUS_LIGHT}`;

/** How a reader opens the project instructions: a link to the page that shows them (instructor) or a window (leader, student). */
interface InstructionsAccess {
  instructionsHref?: string;
  onViewInstructions?: (quote?: string) => void;
}

function Pill({ kind, instructor }: { kind: RequirementKind; instructor: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${PILL[kind].cls}`}>
      <span aria-hidden="true">{PILL[kind].icon}</span>
      {pillLabel(kind, instructor)}
    </span>
  );
}

/** "See in the instructions": highlights the sentence the requirement comes from, when there is one. */
function SeeInInstructions({ quote, access }: { quote?: string; access: InstructionsAccess }) {
  if (access.onViewInstructions) {
    return <button type="button" onClick={() => access.onViewInstructions!(quote)} className={LINK_CLS}>See in the instructions</button>;
  }
  if (access.instructionsHref) {
    return (
      <a
        href={`${access.instructionsHref}${quote ? highlightHash(quote) : ""}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="See in the instructions (new tab)"
        className={LINK_CLS}
      >
        See in the instructions
      </a>
    );
  }
  return null;
}

const hasSource = (r: Req) => !!(r.sourceQuote || r.sourceFile);
const fileSource = (r: Req) => `${r.sourceFile}${r.sourcePage ? `, page ${r.sourcePage}` : ""}`;

/** "Project instructions: "<sentence>"" or "From: <file>, page 2", then the link. Nothing for older checks. */
function FromLine({ r, access }: { r: Req; access: InstructionsAccess }) {
  if (!hasSource(r)) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 [overflow-wrap:anywhere]">
      {r.sourceQuote ? <span>Project instructions: “{truncateQuote(r.sourceQuote, 200)}”</span> : <span>From: {fileSource(r)}</span>}
      <SeeInInstructions quote={r.sourceQuote} access={access} />
    </div>
  );
}

// Where to look when the proof could not be confirmed: the Docs tab and the repository, whichever the page can open.
function LookIn({ repoUrl, docs }: { repoUrl?: string | null; docs: boolean }) {
  const canOpenDocs = useOpenDocSection() !== null && docs;
  if (!canOpenDocs && !repoUrl) return <span>{CHECK_WORK_LINE}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-3">
      {canOpenDocs && <DocsTabLink>Open FairTraze Docs</DocsTabLink>}
      {repoUrl && (
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the repository on GitHub (new tab)"
          className={LINK_CLS}
        >
          Open the repository
        </a>
      )}
    </span>
  );
}

/** Closed by default. Covered rows start with where in the instructions the requirement comes from. */
function Proof({ r, access, showSource }: { r: Req; access: InstructionsAccess; showSource: boolean }) {
  // The same file is shown once per row, however many quotes pointed at it.
  const seen = new Set<string>();
  const evidence = r.evidence.filter((e) => {
    if (e.type !== "file") return true;
    if (seen.has(e.ref)) return false;
    seen.add(e.ref);
    return true;
  });
  const withSource = showSource && hasSource(r);
  if (evidence.length === 0 && !withSource) return null;
  return (
    <details className="mt-1">
      <summary className={`flex min-h-10 cursor-pointer items-center text-xs font-semibold text-indigo-900 underline underline-offset-2 ${FOCUS_LIGHT}`}>See proof</summary>
      <div className="space-y-2 pb-1">
        {withSource && (
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-800">
            <span>From the project instructions{r.sourceFile ? ` (${fileSource(r)})` : ""}:</span>
            <SeeInInstructions quote={r.sourceQuote} access={access} />
          </div>
        )}
        {evidence.length > 0 && (
          <ul className="space-y-2">
            {evidence.map((e, j) => (
              <li key={j} className="rounded-lg bg-slate-50 px-3 py-2 text-sm leading-normal">
                {e.type === "file" ? (
                  <div className="flex flex-wrap items-center gap-x-1 text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">
                    <span>Code:</span>
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
        )}
      </div>
    </details>
  );
}

/** A small label/value grid (label column about 64px), used for the "check" rows. */
function Grid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="mt-1 grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs leading-normal text-slate-800">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-semibold text-slate-700">{label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RequirementRow({ r, instructor, access, repoUrl, docs }: {
  r: Req; instructor: boolean; access: InstructionsAccess; repoUrl?: string | null; docs: boolean;
}) {
  const kind = kindOf(r);
  return (
    <li className="min-w-0 py-2">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <Pill kind={kind} instructor={instructor} />
        <p className="min-w-0 flex-1 basis-48 text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{r.text}</p>
      </div>
      {kind === "CHECK" ? (
        <Grid
          rows={[
            ["Check", instructor ? `Does the work include “${r.text}”?` : `Is “${r.text}” in your work?`],
            ...(hasSource(r) ? [["From", <FromLine key="from" r={r} access={access} />] as [string, React.ReactNode]] : []),
            ["Why", instructor ? CHECK_WHY : NOT_CLEAR_WHY],
            ...(instructor ? [["Look in", <LookIn key="look" repoUrl={repoUrl} docs={docs} />] as [string, React.ReactNode]] : []),
          ]}
        />
      ) : (
        <>
          {kind !== "COVERED" && hasSource(r) && (
            <div className="mt-1 text-xs leading-normal text-slate-800"><FromLine r={r} access={access} /></div>
          )}
          <Proof r={r} access={access} showSource={kind === "COVERED"} />
        </>
      )}
    </li>
  );
}

/** What the AI read and which attached files it skipped. Older checks have no `sources` and show nothing. */
function ReadLines({ sources }: { sources: AiBriefCheck["sources"] }) {
  if (!sources) return null;
  const read = readLine(sources);
  if (!read && sources.skipped.length === 0) return null;
  return (
    <div className="space-y-0.5 text-xs leading-normal text-slate-700 [overflow-wrap:anywhere]">
      {read && <p>{read}</p>}
      {sources.skipped.map((s, i) => <p key={i}>{skippedLine(s)}</p>)}
      {sources.skipped.length > 0 && <p>{SKIPPED_NOT_CHECKED}</p>}
      {sources.filesRead > 0 && <p>{SCANNED_NOTE}</p>}
    </div>
  );
}

function Header() {
  return (
    <summary className={`flex min-h-10 cursor-pointer list-none flex-wrap items-center gap-x-2 px-3 py-2 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden ${FOCUS_LIGHT}`}>
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-700 transition-transform [details[open]>summary_&]:rotate-90" fill="currentColor">
        <path d="M7 4l6 6-6 6V4z" />
      </svg>
      Project instructions check
      <AiBadge variant="ai" />
    </summary>
  );
}

export function BriefCheckCard({
  check, instructor = false, repoUrl, sourceType, instructionsHref, onViewInstructions,
}: {
  check: AiBriefCheck;
  instructor?: boolean;
  repoUrl?: string | null;
  /** The group's source type: hides the Docs link for a GitHub-only group and names the activity compared. */
  sourceType?: string | null;
  /** Instructor: the page that shows the project instructions (opened in a new tab). */
  instructionsHref?: string;
  /** Leader and students: opens the project instructions window, optionally at one sentence. */
  onViewInstructions?: (quote?: string) => void;
}) {
  const [showCovered, setShowCovered] = useState(false);
  const when = formatBasedOn(check.generatedAt);
  const total = check.requirements.length;
  // Files were attached but none could be read and there is no written text: nothing was checked, and why.
  if (check.nothingRead) {
    return (
      <details className="mt-4 rounded-xl border border-slate-200 bg-white">
        <Header />
        <div className="space-y-3 border-t border-slate-200 px-3 py-3">
          <p className="text-sm font-semibold leading-normal text-slate-900">{NOTHING_READ_TITLE}</p>
          <ReadLines sources={check.sources} />
          <p className="text-sm leading-normal text-slate-900">{nothingReadAdvice(instructor)}</p>
        </div>
      </details>
    );
  }
  if (total === 0) return null;

  const access: InstructionsAccess = { instructionsHref, onViewInstructions };
  const counts = countKinds(check.requirements);
  const allCovered = counts.COVERED === total;
  const attention = ATTENTION_ORDER.flatMap((k) => check.requirements.filter((r) => kindOf(r) === k));
  const covered = check.requirements.filter((r) => kindOf(r) === "COVERED");
  const others = otherCountsSentence(counts, instructor);
  const dropped = check.sources?.droppedCount ?? 0;
  const docs = sourceType !== "GITHUB";

  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white">
      <Header />
      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-normal text-slate-700">
          <span className="flex min-w-0 items-center gap-1">
            {comparedSentence(sourceType)}
            <InfoTip label="About the project instructions check" helpHref={helpLink("ai")}>{TIPS.briefCheck}</InfoTip>
          </span>
          {instructionsHref && !onViewInstructions && (
            <a href={instructionsHref} target="_blank" rel="noopener noreferrer" aria-label="View the instructions (new tab)" className={LINK_CLS}>View the instructions</a>
          )}
          {onViewInstructions && (
            <button type="button" onClick={() => onViewInstructions()} className={LINK_CLS}>View the instructions</button>
          )}
        </div>
        <ReadLines sources={check.sources} />
        <p className="text-sm font-semibold leading-normal text-slate-900">
          {coveredSentence(counts.COVERED, total)}
          {others && !allCovered ? ` ${others}` : ""}
        </p>
        {!allCovered && attention.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {attention.map((r, i) => <RequirementRow key={i} r={r} instructor={instructor} access={access} repoUrl={repoUrl} docs={docs} />)}
          </ul>
        )}
        {!allCovered && covered.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showCovered}
              aria-controls="instructions-covered-list"
              onClick={() => setShowCovered((v) => !v)}
              className={`inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 ${FOCUS_LIGHT}`}
            >
              {coveredToggleLabel(showCovered, covered.length)}
            </button>
            {showCovered && (
              <ul id="instructions-covered-list" className="divide-y divide-slate-100">
                {covered.map((r, i) => <RequirementRow key={i} r={r} instructor={instructor} access={access} repoUrl={repoUrl} docs={docs} />)}
              </ul>
            )}
          </>
        )}
        {dropped > 0 && <p className="text-xs leading-normal text-slate-700">{droppedSentence(dropped)}</p>}
        <p className="text-xs leading-normal text-slate-700">
          May be wrong{when ? ` · Based on the analysis of ${when}` : ""}.
          {check.outdated ? " The project instructions or the analysis changed since. Generate again to update it." : ""}
        </p>
        {instructor && (check.aiAddressedCount ?? 0) > 0 && (
          <p className="text-xs leading-normal text-slate-700">Some text in the group's work appears to address the AI. It was not used.</p>
        )}
      </div>
    </details>
  );
}

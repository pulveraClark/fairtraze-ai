import { useId, useState } from "react";
import { FOCUS_LIGHT } from "./ui";
import { InfoTip } from "./ui/InfoTip";
import { AiBadge } from "./ui/AiBadge";
import { FileEvidenceLink } from "./ui/ExternalEvidenceLink";
import { DocSectionLink, DocsTabLink, useOpenDocSection } from "../hooks/useDocSectionLink";
import { TIPS, helpLink } from "../lib/helpText";
import { formatBasedOn, type AiBriefCheck } from "../lib/aiReview";
import { RequirementMarkPanel } from "./RequirementMarkPanel";
import type { MarksApi } from "../hooks/useRequirementMarks";
import { isMarkable } from "@shared/requirementMarkable";
import { CHECK_TIP_SENTENCES, WORKED_ON_LABEL, WORKED_ON_NOTE, visibleWorkedOn, workedOn, type WorkedOn } from "../lib/workedOnBy";
import { STALE_ROW_NOTE, confirmedByInstructor, coveredByAiSentence, marksByKey, staleMarks, staleOrphanLine, type KeyMarks } from "../lib/requirementMarks";
import {
  ATTENTION_ORDER, NOTHING_READ_TITLE, PILL, SCANNED_NOTE, SKIPPED_NOT_CHECKED, comparedSentence, countKinds, coveredSentence,
  coveredToggleLabel, droppedSentence, highlightHash, kindOf, nothingReadAdvice, otherCountsSentence, pillLabel, readLine, skippedLine,
  type RequirementKind,
} from "../lib/instructionsCheck";

// "Project instructions check" with the AI findings badge. Shown to the instructor and the group leader only
// (the server decides; this file never filters by role). It says whether each requirement of the project
// instructions is covered in the group's work. It is not a grade, a score or a judgment of quality.

// The same sentence for everyone: no blame, and a way to check.
export const NOT_CONFIRMED_WHY = "The AI could not confirm this one. It may still be there. Open the Docs or the repository to check.";
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

/** "See in the instructions" (highlights the sentence the requirement comes from) or, for a file source, "Open file". */
function SeeInInstructions({ quote, access, label = "See in the instructions" }: { quote?: string; access: InstructionsAccess; label?: string }) {
  if (access.onViewInstructions) {
    return <button type="button" onClick={() => access.onViewInstructions!(quote)} className={LINK_CLS}>{label}</button>;
  }
  if (access.instructionsHref) {
    return (
      <a
        href={`${access.instructionsHref}${quote ? highlightHash(quote) : ""}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} (new tab)`}
        className={LINK_CLS}
      >
        {label}
      </a>
    );
  }
  return null;
}

/** A requirement read inside quotation marks, without its closing full stop ("Write system documentation." becomes "Write system documentation"). */
export const quoted = (text: string) => text.trim().replace(/[\s.]+$/, "");

const hasSource = (r: Req) => !!(r.sourceQuote || r.sourceFile);
// A requirement that comes from an attached file (and not from a sentence of the written instructions). The page the
// AI named is never shown: the card has no way to check it against the file.
const fromFileOnly = (r: Req) => !r.sourceQuote && !!r.sourceFile;
const FROM_FILE = "From attached file:";

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

/** The distinct evidence of a requirement: the same file is shown once per row, however many quotes pointed at it. */
function evidenceOf(r: Req) {
  const seen = new Set<string>();
  return r.evidence.filter((e) => {
    if (e.type !== "file") return true;
    if (seen.has(e.ref)) return false;
    seen.add(e.ref);
    return true;
  });
}

/** Covered rows start their proof with where in the instructions the requirement comes from; other rows show that as a link on their line. */
const hasProof = (r: Req, showSource: boolean) => evidenceOf(r).length > 0 || (showSource && hasSource(r));

/** What opens under a row's "Proof" button. */
function ProofBody({ r, access, showSource }: { r: Req; access: InstructionsAccess; showSource: boolean }) {
  const evidence = evidenceOf(r);
  const withSource = showSource && hasSource(r);
  return (
    <div className="space-y-2 pb-1">
      {withSource && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-800">
          {fromFileOnly(r) ? (
            <>
              <span className="[overflow-wrap:anywhere]">{FROM_FILE} {r.sourceFile}</span>
              <SeeInInstructions access={access} label="Open file" />
            </>
          ) : (
            <>
              <span>From the project instructions:</span>
              <SeeInInstructions quote={r.sourceQuote} access={access} />
            </>
          )}
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
  );
}

/** "Proof ▾": opens the row's proof under it. A native button, so Enter and Space work; aria-expanded tells the state. */
function ProofButton({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={`order-3 ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 sm:order-4 text-xs font-semibold text-indigo-900 underline underline-offset-2 hover:bg-slate-100 ${FOCUS_LIGHT}`}
    >
      Proof <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
  );
}

/** A small label/value grid (label column about 64px), used for the "check" rows. */
function Grid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="mt-1 grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 text-xs leading-normal text-slate-800">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-semibold text-slate-700">{label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Worked on by" + up to 2 name chips + "+N", or one plain mark sentence. Nothing is rendered without a line. */
function WorkedOnBy({ line, inline = false }: { line: WorkedOn; inline?: boolean }) {
  if (!line) return null;
  return (
    <div className={`${inline ? "" : "mt-1 "}flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-normal text-slate-700`}>
      <span className="font-semibold">{WORKED_ON_LABEL}</span>
      {line.type === "names" ? (
        <>
          {line.shown.map((n) => (
            <span key={n} className="inline-flex min-w-0 items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-0.5 pr-2 text-slate-900">
              <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-semibold leading-none text-slate-900">{n.charAt(0).toUpperCase()}</span>
              <span className="[overflow-wrap:anywhere]">{n}</span>
            </span>
          ))}
          {line.more > 0 && <span>+{line.more}</span>}
        </>
      ) : (
        <span className="min-w-0 [overflow-wrap:anywhere]">{line.text}</span>
      )}
    </div>
  );
}

function RequirementRow({ r, instructor, access, repoUrl, docs, marks, keyMarks, staleNote }: {
  r: Req; instructor: boolean; access: InstructionsAccess; repoUrl?: string | null; docs: boolean;
  marks?: MarksApi; keyMarks?: KeyMarks; staleNote?: boolean;
}) {
  const kind = kindOf(r);
  const covered = kind === "COVERED";
  const [proofOpen, setProofOpen] = useState(false);
  const proofId = useId();
  const line = visibleWorkedOn(workedOn(r, instructor, keyMarks), kind);
  // Covered and partly covered rows get the Proof button; a row that needs a check shows its Why / Look in instead.
  const proof = (covered || kind === "PARTLY") && hasProof(r, covered);
  return (
    <li className="min-w-0 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {covered ? (
          <>
            <span aria-hidden="true" className="order-1 shrink-0 font-semibold text-emerald-800">✓</span>
            <span className="sr-only order-1">Covered</span>
          </>
        ) : (
          <Pill kind={kind} instructor={instructor} />
        )}
        <p className={`min-w-0 flex-1 text-sm leading-normal text-slate-900 [overflow-wrap:anywhere] ${covered ? "order-2 basis-40" : "basis-48"}`}>{r.text}</p>
        {/* On a narrow screen the names wrap under the line and Proof stays beside the text. */}
        {covered && line && <div className="order-4 basis-full sm:order-3 sm:basis-auto"><WorkedOnBy line={line} inline /></div>}
        {!covered && fromFileOnly(r) && (
          <>
            <span className="min-w-0 text-xs text-slate-800 [overflow-wrap:anywhere]">{FROM_FILE} {r.sourceFile}</span>
            <SeeInInstructions access={access} label="Open file" />
          </>
        )}
        {!covered && hasSource(r) && !fromFileOnly(r) && <SeeInInstructions quote={r.sourceQuote} access={access} />}
        {proof && <ProofButton open={proofOpen} onToggle={() => setProofOpen((v) => !v)} controls={proofId} />}
      </div>
      {kind === "CHECK" && (
        <Grid
          rows={[
            ["Check", instructor ? `Does the work include “${quoted(r.text)}”?` : `Is “${quoted(r.text)}” in your work?`],
            ["Why", NOT_CONFIRMED_WHY],
            ["Look in", <LookIn key="look" repoUrl={repoUrl} docs={docs} />],
          ]}
        />
      )}
      {proof && proofOpen && <div id={proofId} className="mt-1"><ProofBody r={r} access={access} showSource={covered} /></div>}
      {!covered && line && <WorkedOnBy line={line} />}
      {staleNote && <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs leading-normal text-amber-950">{STALE_ROW_NOTE}</p>}
      {marks && r.key && (
        <RequirementMarkPanel
          requirementKey={r.key}
          marks={keyMarks}
          api={marks}
          canClaim={marks.role === "leader" && isMarkable(r)}
          canCheck={marks.role === "instructor" && isMarkable(r)}
        />
      )}
    </li>
  );
}

/** What the AI read and which attached files it skipped. Older checks have no `sources` and show nothing. */
function ReadLines({ sources, onlyProblems = false }: { sources: AiBriefCheck["sources"]; onlyProblems?: boolean }) {
  if (!sources) return null;
  // In the instructor's summary card the routine "The AI read…" and scan notes live in the (i) tip; only a problem shows here.
  if (onlyProblems) {
    if (sources.skipped.length === 0) return null;
    return (
      <div className="space-y-0.5 text-xs leading-normal text-slate-700 [overflow-wrap:anywhere]">
        {sources.skipped.map((s, i) => <p key={i}>{skippedLine(s)}</p>)}
        <p>{SKIPPED_NOT_CHECKED}</p>
      </div>
    );
  }
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

/** The collapsible frame. `embedded` drops it when a parent row already provides the heading. */
function Shell({ embedded, children }: { embedded?: boolean; children: React.ReactNode }) {
  if (embedded) return <div className="mt-2 rounded-xl border border-slate-200 bg-white">{children}</div>;
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-white">
      <Header />
      {children}
    </details>
  );
}

export function BriefCheckCard({
  check, instructor = false, repoUrl, sourceType, instructionsHref, onViewInstructions, marks, embedded = false,
}: {
  /** Render the body without its own heading row, intro, headline or disclaimer (the instructor's summary card has them). */
  embedded?: boolean;
  check: AiBriefCheck;
  instructor?: boolean;
  repoUrl?: string | null;
  /** The group's source type: hides the Docs link for a GitHub-only group and names the activity compared. */
  sourceType?: string | null;
  /** Instructor: the page that shows the project instructions (opened in a new tab). */
  instructionsHref?: string;
  /** Leader and students: opens the project instructions window, optionally at one sentence. */
  onViewInstructions?: (quote?: string) => void;
  /** "We have this" marks and the actions on them (leader and instructor). Absent: the card is read-only. */
  marks?: MarksApi;
}) {
  const [showCovered, setShowCovered] = useState(false);
  const when = formatBasedOn(check.generatedAt);
  const total = check.requirements.length;
  // Files were attached but none could be read and there is no written text: nothing was checked, and why.
  if (check.nothingRead) {
    return (
      <Shell embedded={embedded}>
        <div className={`space-y-3 px-3 py-3 ${embedded ? "" : "border-t border-slate-200"}`}>
          <p className="text-sm font-semibold leading-normal text-slate-900">{NOTHING_READ_TITLE}</p>
          <ReadLines sources={check.sources} />
          <p className="text-sm leading-normal text-slate-900">{nothingReadAdvice(instructor)}</p>
        </div>
      </Shell>
    );
  }
  if (total === 0) return null;

  const access: InstructionsAccess = { instructionsHref, onViewInstructions };
  const counts = countKinds(check.requirements);
  const allCovered = counts.COVERED === total;
  const attention = ATTENTION_ORDER.flatMap((k) => check.requirements.filter((r) => kindOf(r) === k));
  const covered = check.requirements.filter((r) => kindOf(r) === "COVERED");
  const dropped = check.sources?.droppedCount ?? 0;
  const docs = sourceType !== "GITHUB";
  const keyMarks = marks ? marksByKey(marks.marks) : undefined;
  const confirmed = marks ? confirmedByInstructor(check.requirements, marks.marks) : 0;
  // A stale mark goes on the row it is about; when that requirement is no longer in the check, on a line after the list.
  const stale = marks ? staleMarks(marks.marks) : [];
  const liveKeys = new Set(check.requirements.map((r) => r.key).filter(Boolean));
  const staleKeys = new Set(stale.filter((m) => liveKeys.has(m.requirementKey)).map((m) => m.requirementKey));
  const orphans = stale.filter((m) => !liveKeys.has(m.requirementKey));
  // An item the instructor confirmed no longer needs a check, so it is left out of "needs your check".
  const stillOpen = keyMarks ? check.requirements.filter((r) => !(kindOf(r) !== "COVERED" && r.key && keyMarks.get(r.key)?.instructor)) : check.requirements;
  const others = otherCountsSentence(countKinds(stillOpen), instructor);
  const row = (r: Req, i: number) => (
    <RequirementRow
      key={i} r={r} instructor={instructor} access={access} repoUrl={repoUrl} docs={docs} marks={marks}
      keyMarks={r.key ? keyMarks?.get(r.key) : undefined} staleNote={!!r.key && staleKeys.has(r.key)}
    />
  );

  return (
    <Shell embedded={embedded}>
      <div className={`space-y-3 px-3 py-3 ${embedded ? "" : "border-t border-slate-200"}`}>
        {!embedded && (
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
        )}
        <ReadLines sources={check.sources} onlyProblems={embedded} />
        {!embedded && (
          <p className="text-sm font-semibold leading-normal text-slate-900">
            {confirmed > 0 ? coveredByAiSentence(counts.COVERED, total, confirmed) : coveredSentence(counts.COVERED, total)}
            {others && !allCovered ? ` ${others}` : ""}
          </p>
        )}
        {!allCovered && attention.length > 0 && (
          <ul className="divide-y divide-slate-100">{attention.map(row)}</ul>
        )}
        {covered.length > 0 && (
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
            {showCovered && <ul id="instructions-covered-list" className="divide-y divide-slate-100">{covered.map(row)}</ul>}
          </>
        )}
        {!embedded && check.requirements.some((r) => r.contributors) && (
          <p className="text-xs leading-normal text-slate-700">{WORKED_ON_NOTE}</p>
        )}
        {orphans.length > 0 && (
          <div className="space-y-1">
            {orphans.map((m) => (
              <p key={m.requirementKey} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs leading-normal text-amber-950 [overflow-wrap:anywhere]">
                {staleOrphanLine(m)}
              </p>
            ))}
          </div>
        )}
        {dropped > 0 && <p className="text-xs leading-normal text-slate-700">{droppedSentence(dropped)}</p>}
        {!embedded && (
          <p className="text-xs leading-normal text-slate-700">
            May be wrong{when ? ` · Based on the analysis of ${when}` : ""}.
            {check.outdated ? " The project instructions or the analysis changed since. Generate again to update it." : ""}
          </p>
        )}
        {embedded && check.outdated && (
          <p className="text-xs leading-normal text-slate-700">The project instructions or the analysis changed since. Generate again to update it.</p>
        )}
        {instructor && (check.aiAddressedCount ?? 0) > 0 && (
          <p className="text-xs leading-normal text-slate-700">Some text in the group's work appears to address the AI. It was not used.</p>
        )}
      </div>
    </Shell>
  );
}

/** Right side of the check's header in the instructor's summary card: "View the instructions" and the (i) tip (opens on tap). */
export function CheckHeaderActions({ sources, instructionsHref, onViewInstructions }: {
  sources?: AiBriefCheck["sources"];
  instructionsHref?: string;
  onViewInstructions?: (quote?: string) => void;
}) {
  const read = readLine(sources);
  return (
    <>
      {onViewInstructions && <button type="button" onClick={() => onViewInstructions()} className={LINK_CLS}>View the instructions</button>}
      {instructionsHref && !onViewInstructions && (
        <a href={instructionsHref} target="_blank" rel="noopener noreferrer" aria-label="View the instructions (new tab)" className={LINK_CLS}>View the instructions</a>
      )}
      <InfoTip label="About the project instructions check" helpHref={helpLink("ai")} large>
        <p>{CHECK_TIP_SENTENCES.join(" ")}</p>
        {(read || (sources?.filesRead ?? 0) > 0) && (
          <p className="mt-1.5">{[read, sources && sources.filesRead > 0 ? SCANNED_NOTE : null].filter(Boolean).join(" ")}</p>
        )}
      </InfoTip>
    </>
  );
}

import { useId, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRequirementMarks, type MarksApi } from "../hooks/useRequirementMarks";
import { ProofBody, RequirementActions, hasProof, type InstructionsAccess } from "./BriefCheckCard";
import { FOCUS_LIGHT } from "./ui/styles";
import { marksByKey, STALE_ROW_NOTE, staleMarks, type KeyMarks } from "../lib/requirementMarks";
import { NOTHING_READ_TITLE } from "../lib/instructionsCheck";
import type { AiBriefCheck } from "../lib/aiReview";
import type { OpenFileResult } from "../lib/briefAttachments";

// The project instructions check inside the Team overview card, for every member of the group: read-only, collapsed by
// default, one header line with the count. Opened, every requirement shows a plain status word and its proof behind
// "See proof". Only the group leader also gets "We have this" on the ones that are not covered. The AI pill and the
// "can be wrong" note belong to the card, not to this block. Display only; the server sends plain states, never scores.

export const CHECK_OUTDATED_TEXT = "May be out of date. Your instructor can refresh it.";
export const checkHeaderText = (found: number, total: number) =>
  found === total ? `Project instructions: All ${total} covered` : `Project instructions: ${found} of ${total} covered`;

type State = NonNullable<AiBriefCheck["requirements"][number]["state"]>;
type Req = AiBriefCheck["requirements"][number];

/** The words a student reads. Symbol and word together, never colour alone. */
export const STATE_WORDS: Record<State, { icon: string; word: string; cls: string }> = {
  COVERED: { icon: "✓", word: "Covered", cls: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  CONFIRMED: { icon: "✓", word: "Confirmed by your instructor", cls: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  PARTLY: { icon: "◐", word: "Partly covered", cls: "border-amber-300 bg-amber-50 text-amber-950" },
  NOT_FOUND: { icon: "○", word: "Not found yet", cls: "border-slate-300 bg-slate-100 text-slate-900" },
  NOT_CONFIRMED: { icon: "?", word: "Not confirmed yet", cls: "border-slate-300 bg-slate-100 text-slate-900" },
};

const isCovered = (s: State | undefined) => s === "COVERED" || s === "CONFIRMED";
export const coveredCount = (check: AiBriefCheck) => check.requirements.filter((r) => isCovered(r.state)).length;

/** True when the block would render something (the card uses it to decide whether the one AI pill is needed). */
export function hasStudentCheck(check: AiBriefCheck | undefined | null): boolean {
  return !!check && (!!check.nothingRead || check.requirements.length > 0);
}

function Row({ r, access, marks, keyMarks, stale }: { r: Req; access: InstructionsAccess; marks?: MarksApi; keyMarks?: Map<string, KeyMarks>; stale: boolean }) {
  const [proofOpen, setProofOpen] = useState(false);
  const proofId = useId();
  const state: State = r.state ?? "NOT_FOUND";
  const tone = STATE_WORDS[state];
  const covered = isCovered(state);
  const proof = hasProof(r, covered);
  return (
    <li className="min-w-0 py-2">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium leading-normal ${tone.cls}`}>
          <span aria-hidden="true">{tone.icon}</span>
          {tone.word}
        </span>
        <p className="min-w-0 flex-1 basis-48 text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{r.text}</p>
      </div>
      {proof && (
        <button
          type="button"
          aria-expanded={proofOpen}
          aria-controls={proofId}
          onClick={() => setProofOpen((v) => !v)}
          className={`mt-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-xs font-medium text-blue-800 underline underline-offset-2 hover:bg-slate-50 ${FOCUS_LIGHT}`}
        >
          See proof <span aria-hidden="true" className={`transition-transform ${proofOpen ? "rotate-180" : ""}`}>▾</span>
        </button>
      )}
      {proof && proofOpen && <div id={proofId} className="mt-1"><ProofBody r={r} access={access} showSource={covered} /></div>}
      {stale && <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs leading-normal text-amber-950">{STALE_ROW_NOTE}</p>}
      {!covered && <RequirementActions r={r} access={access} marks={marks} keyMarks={r.key ? keyMarks?.get(r.key) : undefined} compact />}
    </li>
  );
}

function Body({ check, marks, onViewInstructions, onOpenFile }: {
  check: AiBriefCheck;
  /** The leader's marks (for "We have this"); absent for a plain member, who makes no marks request at all. */
  marks?: MarksApi;
  onViewInstructions?: (quote?: string) => void;
  onOpenFile?: (filename: string) => Promise<OpenFileResult>;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (check.nothingRead) {
    return <p className="text-sm leading-normal text-slate-900">{NOTHING_READ_TITLE}</p>;
  }
  const total = check.requirements.length;
  if (total === 0) return null;
  const found = coveredCount(check);

  const access: InstructionsAccess = { onViewInstructions, openFile: onOpenFile };
  const keyMarks = marks ? marksByKey(marks.marks) : undefined;
  const liveKeys = new Set(check.requirements.map((r) => r.key).filter(Boolean));
  const staleKeys = new Set(marks ? staleMarks(marks.marks).filter((m) => liveKeys.has(m.requirementKey)).map((m) => m.requirementKey) : []);

  return (
    <div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50 ${FOCUS_LIGHT}`}
        >
          <span aria-hidden="true" className={`shrink-0 text-slate-700 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{checkHeaderText(found, total)}</span>
        </button>
        {open && (
          <ul id={panelId} className="divide-y divide-slate-200 border-t border-slate-200 px-3">
            {check.requirements.map((r, i) => (
              <Row key={r.key ?? i} r={r} access={access} marks={marks} keyMarks={keyMarks} stale={!!r.key && staleKeys.has(r.key)} />
            ))}
          </ul>
        )}
      </div>
      {check.outdated && <p className="mt-1.5 text-xs leading-normal text-slate-700">{CHECK_OUTDATED_TEXT}</p>}
    </div>
  );
}

function LeaderBody(props: Omit<Parameters<typeof Body>[0], "marks"> & { projectId: number }) {
  const { token } = useAuth();
  const marks = useRequirementMarks(props.projectId, token, "leader");
  return <Body {...props} marks={marks} />;
}

export function StudentTeamCheck({ projectId, check, canClaim = false, onViewInstructions, onOpenFile }: {
  projectId: number;
  check: AiBriefCheck;
  /** The group leader only: "We have this" on requirements that are not covered. */
  canClaim?: boolean;
  onViewInstructions?: (quote?: string) => void;
  onOpenFile?: (filename: string) => Promise<OpenFileResult>;
}) {
  return canClaim
    ? <LeaderBody projectId={projectId} check={check} onViewInstructions={onViewInstructions} onOpenFile={onOpenFile} />
    : <Body check={check} onViewInstructions={onViewInstructions} onOpenFile={onOpenFile} />;
}

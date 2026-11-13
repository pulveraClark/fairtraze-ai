import { useId, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRequirementMarks } from "../hooks/useRequirementMarks";
import { RequirementActions, type InstructionsAccess } from "./BriefCheckCard";
import { FOCUS_LIGHT } from "./ui/styles";
import { instructionsSummary } from "../lib/aiSummary";
import { marksByKey, staleMarks, STALE_ROW_NOTE } from "../lib/requirementMarks";
import { NOTHING_READ_TITLE } from "../lib/instructionsCheck";
import type { AiBriefCheck } from "../lib/aiReview";
import type { OpenFileResult } from "../lib/briefAttachments";

// The leader's project instructions check inside the Team overview card. Collapsed by default: one header line with the
// count; opened, only what is not covered yet, each with "See in the instructions" and a small "We have this".
// The AI pill and the "can be wrong" note belong to the card, not to this block. Display only.

export const CHECK_OUTDATED_TEXT = "May be out of date. Your instructor can refresh it.";
export const checkHeaderText = (found: number, total: number) =>
  found === total ? `Project instructions: All ${total} covered` : `Project instructions: ${found} of ${total} covered`;
export const showCoveredLabel = (n: number, open: boolean) => (open ? `Hide ${n} covered` : `Show ${n} covered`);

/** True when the block would render something (the card uses it to decide whether the one AI pill is needed). */
export function hasStudentCheck(check: AiBriefCheck | undefined | null): boolean {
  return !!check && (!!check.nothingRead || check.requirements.length > 0);
}

const SMALL_LINK = `inline-flex min-h-8 items-center rounded-md px-1 text-xs font-medium text-blue-800 underline underline-offset-2 hover:bg-slate-50 ${FOCUS_LIGHT}`;

export function StudentTeamCheck({ projectId, check, onViewInstructions, onOpenFile }: {
  projectId: number;
  check: AiBriefCheck;
  onViewInstructions?: (quote?: string) => void;
  onOpenFile?: (filename: string) => Promise<OpenFileResult>;
}) {
  const { token } = useAuth();
  const marks = useRequirementMarks(projectId, token, "leader");
  const [open, setOpen] = useState(false);
  const [showCovered, setShowCovered] = useState(false);
  const panelId = useId();
  const coveredId = useId();

  if (check.nothingRead) {
    return <p className="text-sm leading-normal text-slate-900">{NOTHING_READ_TITLE}</p>;
  }
  const summary = instructionsSummary(check.requirements, marks.marks);
  if (summary.total === 0) return null;

  const access: InstructionsAccess = { onViewInstructions, openFile: onOpenFile };
  const keyMarks = marksByKey(marks.marks);
  const liveKeys = new Set(check.requirements.map((r) => r.key).filter(Boolean));
  const staleKeys = new Set(staleMarks(marks.marks).filter((m) => liveKeys.has(m.requirementKey)).map((m) => m.requirementKey));
  const openKeys = new Set(summary.look.map((i) => i.req));
  const coveredRows = check.requirements.filter((r) => !openKeys.has(r));
  const allCovered = summary.needCheck === 0;

  const coveredToggle = summary.found > 0 && (
    <button
      type="button"
      aria-expanded={showCovered}
      aria-controls={coveredId}
      onClick={() => setShowCovered((v) => !v)}
      className={SMALL_LINK}
    >
      {showCoveredLabel(summary.found, showCovered)}
    </button>
  );
  const coveredList = showCovered && (
    <ul id={coveredId} className="mt-1 space-y-1">
      {coveredRows.map((r, i) => (
        <li key={r.key ?? i} className="flex items-start gap-2 text-sm leading-normal text-slate-900">
          <span aria-hidden="true" className="shrink-0 font-semibold text-emerald-800">✓</span>
          <span className="sr-only">Covered: </span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{r.text}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      {allCovered ? (
        <div>
          <div className="flex flex-wrap items-center gap-x-3">
            <p className="text-sm font-medium leading-normal text-slate-900">{checkHeaderText(summary.found, summary.total)}</p>
            {coveredToggle}
          </div>
          {coveredList}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50 ${FOCUS_LIGHT}`}
          >
            <span aria-hidden="true" className={`shrink-0 text-slate-700 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{checkHeaderText(summary.found, summary.total)}</span>
          </button>
          {open && (
            <div id={panelId} className="space-y-3 border-t border-slate-200 px-3 py-3">
              <p className="text-xs font-semibold text-slate-900">Not covered yet ({summary.needCheck})</p>
              <ul className="space-y-3">
                {summary.look.map((i) => (
                  <li key={i.req.key ?? i.text} className="min-w-0">
                    <p className="text-sm leading-normal text-slate-900 [overflow-wrap:anywhere]">{i.text}</p>
                    {i.req.key && staleKeys.has(i.req.key) && (
                      <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs leading-normal text-amber-950">{STALE_ROW_NOTE}</p>
                    )}
                    <RequirementActions r={i.req} access={access} marks={marks} keyMarks={i.req.key ? keyMarks.get(i.req.key) : undefined} compact />
                  </li>
                ))}
              </ul>
              {coveredToggle}
              {coveredList}
            </div>
          )}
        </div>
      )}
      {check.outdated && <p className="mt-1.5 text-xs leading-normal text-slate-700">{CHECK_OUTDATED_TEXT}</p>}
    </div>
  );
}

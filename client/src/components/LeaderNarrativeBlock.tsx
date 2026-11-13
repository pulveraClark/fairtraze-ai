import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { AiBadge } from "./ui/AiBadge";
import { aiFooterLine } from "../lib/aiFooter";
import { FOCUS_LIGHT } from "./ui/styles";

export const LEADER_OUTDATED_TEXT = "Out of date. Your instructor can regenerate it.";

/**
 * The AI explanation the group leader may read. When it was written for other numbers than the ones now on
 * the page, only the plain notice is shown; the earlier text is one click away ("Show previous text"), so it
 * never sits beside figures it does not match. Display only.
 */
export function LeaderNarrativeBlock({ narrative, outdated }: { narrative: string; outdated: boolean }) {
  const [showPrevious, setShowPrevious] = useState(false);
  const textVisible = !outdated || showPrevious;
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1"><AiBadge variant="ai" /></p>
      {outdated && (
        <p role="status" className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium leading-normal text-amber-950">
          <span>{LEADER_OUTDATED_TEXT}</span>
          <button
            type="button"
            aria-expanded={showPrevious}
            onClick={() => setShowPrevious((v) => !v)}
            className={`inline-flex min-h-8 items-center rounded font-semibold text-blue-800 underline underline-offset-2 ${FOCUS_LIGHT}`}
          >
            {showPrevious ? "Hide previous text" : "Show previous text"}
          </button>
        </p>
      )}
      {textVisible && (
        <div className="mt-1.5 text-sm leading-relaxed text-slate-800 [&_p]:mb-0 [&_p]:mt-2 [&_p:first-child]:mt-0">
          <ReactMarkdown>{narrative}</ReactMarkdown>
        </div>
      )}
      {textVisible && <p className="mt-2 text-xs leading-normal text-slate-700">{aiFooterLine()}</p>}
    </div>
  );
}

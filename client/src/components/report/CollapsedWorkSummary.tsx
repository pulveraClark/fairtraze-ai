import { useId, useState } from "react";
import { FOCUS_LIGHT } from "../ui";
import { WorkSummaryBlock } from "./AiWorkSummary";
import type { AiReviewResponse, AiSummaryView } from "../../lib/aiReview";

/**
 * One member's "what they worked on" for a student screen: closed until asked, so a busy card stays calm.
 * The server decides who receives a summary (own only for a member, everyone's for the leader); this only
 * shows what it was given. Display only: no score, share or flag is read here.
 */
export function CollapsedWorkSummary({ label, summary, data, sourceType }: {
  label: string;
  summary: AiSummaryView;
  data: AiReviewResponse;
  sourceType?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-50 ${FOCUS_LIGHT}`}
      >
        <span aria-hidden="true" className={`shrink-0 text-slate-700 transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      </button>
      {open && (
        <div id={id} className="px-2 pb-2 pt-1">
          <WorkSummaryBlock summary={summary} data={data} sourceType={sourceType} />
        </div>
      )}
    </div>
  );
}

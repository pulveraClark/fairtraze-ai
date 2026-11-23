import { WorkSummaryBlock } from "./AiWorkSummary";
import type { AiReviewResponse, AiSummaryView } from "../../lib/aiReview";

/**
 * A member's own "what you worked on" on the student Team overview: always open, no toggle.
 * The server decides who receives a summary; this only shows what it was given. Display only.
 */
export function OpenWorkSummary({ label, summary, data, sourceType }: {
  label: string;
  summary: AiSummaryView;
  data: AiReviewResponse;
  sourceType?: string | null;
}) {
  return (
    <section aria-label={label} className="min-w-0">
      <h3 className="px-2 text-sm font-medium text-slate-900">{label}</h3>
      <div className="px-2 pb-2 pt-1">
        <WorkSummaryBlock summary={summary} data={data} sourceType={sourceType} />
      </div>
    </section>
  );
}

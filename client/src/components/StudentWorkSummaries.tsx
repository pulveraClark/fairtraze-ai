import { useAuth } from "../context/AuthContext";
import { useAiReview } from "../hooks/useAiReview";
import { CARD } from "./ui";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import { WorkSummaryBlock } from "./report/AiWorkSummary";
import { BriefCheckWithMarks } from "./BriefCheckWithMarks";

/**
 * Student report tab. A member sees "AI findings on your work"; the leader sees one entry per member
 * ("What each member worked on") and the project instructions check. The server sends a member only their own entry
 * and the check to nobody but the leader and the instructor, so this component simply shows what
 * it receives. Renders nothing while AI review is off or nothing exists yet.
 */
export function StudentWorkSummaries({ projectId, isLeader, sourceType, onViewInstructions }: {
  projectId: number;
  isLeader: boolean;
  sourceType?: string | null;
  /** Opens the project instructions window (optionally at one sentence). Given only when the page has the instructions. */
  onViewInstructions?: (quote?: string) => void;
}) {
  const { token } = useAuth();
  const { data } = useAiReview(projectId, token);
  if (!data?.enabled) return null;

  const rows = data.summaries ?? [];
  const briefCheck = data.briefCheck;
  if (rows.length === 0 && !briefCheck) return null;

  const mine = rows.find((s) => s.isYou);
  const title = isLeader ? "What each member worked on" : "AI findings on your work";
  return (
    <section aria-labelledby="student-work-summary-title" className={`${CARD} min-w-0 p-4`}>
      {rows.length > 0 && (
        <>
          <h3 id="student-work-summary-title" className="flex items-center gap-1 text-sm font-semibold text-slate-900">
            {title}
            <InfoTip label="About the AI findings" helpHref={helpLink("ai")}>{TIPS.workSummary}</InfoTip>
          </h3>
          {isLeader ? (
            <ul className="mt-2 divide-y divide-slate-200">
              {rows.map((s) => (
                <li key={s.userId} className="py-3 first:pt-1 last:pb-0">
                  <WorkSummaryBlock summary={s} data={data} label={s.isYou ? `${s.name} (you)` : s.name} sourceType={sourceType} />
                </li>
              ))}
            </ul>
          ) : mine ? (
            <div className="mt-2">
              <WorkSummaryBlock summary={mine} data={data} sourceType={sourceType} />
            </div>
          ) : null}
        </>
      )}
      {briefCheck && <BriefCheckWithMarks projectId={projectId} check={briefCheck} repoUrl={data.repoUrl} sourceType={sourceType} onViewInstructions={onViewInstructions} />}
    </section>
  );
}

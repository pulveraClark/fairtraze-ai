import { useAuth } from "../context/AuthContext";
import { useAiReview } from "../hooks/useAiReview";
import { CARD } from "./ui";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import { WorkSummaryBlock } from "./report/AiWorkSummary";

/**
 * Student report tab. A member sees "Summary of your work"; the leader sees one entry per member
 * ("What each member worked on"). The server sends a member only their own entry, so this component
 * simply shows what it receives. Renders nothing while AI review is off or no summary exists yet.
 */
export function StudentWorkSummaries({ projectId, isLeader }: { projectId: number; isLeader: boolean }) {
  const { token } = useAuth();
  const { data } = useAiReview(projectId, token);
  const list = data?.enabled ? data.summaries : null;
  if (!data || !list || list.length === 0) return null;

  const mine = list.find((s) => s.isYou);
  const title = isLeader ? "What each member worked on" : "Summary of your work";
  return (
    <section aria-labelledby="student-work-summary-title" className={`${CARD} min-w-0 p-4`}>
      <h3 id="student-work-summary-title" className="flex items-center gap-1 text-sm font-semibold text-slate-900">
        {title}
        <InfoTip label="About the work summary" helpHref={helpLink("ai")}>{TIPS.workSummary}</InfoTip>
      </h3>
      {isLeader ? (
        <ul className="mt-2 divide-y divide-slate-200">
          {list.map((s) => (
            <li key={s.userId} className="py-3 first:pt-1 last:pb-0">
              <WorkSummaryBlock summary={s} data={data} label={s.isYou ? `${s.name} (you)` : s.name} />
            </li>
          ))}
        </ul>
      ) : mine ? (
        <div className="mt-2">
          <WorkSummaryBlock summary={mine} data={data} />
        </div>
      ) : null}
    </section>
  );
}

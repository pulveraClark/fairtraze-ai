import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { groupKeys } from "../../hooks/useGroupQueries";
import { taskApi } from "../../lib/tasks/api";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { BUTTON_SECONDARY_COMPACT } from "../ui/styles";
import { AlertTriangleIcon, CloseIcon } from "./icons";

interface Props {
  projectId: number;
  onClose: () => void;
}

/**
 * Open work per member, for the group leader (and the class instructor). Counts of tasks only: it says who
 * has how much planned work open, not who has contributed more, and it never changes a contribution score.
 */
export function WorkloadPanel({ projectId, onClose }: Props) {
  const { token, user } = useAuth();
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const query = useQuery({
    queryKey: groupKeys.workload(user?.id ?? null, projectId),
    queryFn: () => taskApi.workload(token, projectId),
    enabled: !!token,
    retry: false,
  });
  const data = query.data;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="workload-title"
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="workload-title" className="text-lg font-semibold text-slate-900">Workload</h2>
            <p className="mt-0.5 text-sm text-slate-800">Open tasks per member. Planning only. Not part of the contribution score.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close workload" className={`${BUTTON_SECONDARY_COMPACT} !px-2`}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {query.isLoading && <p className="mt-4 text-sm text-slate-700">Loading…</p>}
        {query.isError && (
          <div role="alert" className="mt-4 text-sm">
            <p className="font-medium text-red-800">{query.error instanceof Error ? query.error.message : "Could not load the workload."}</p>
            <button type="button" onClick={() => void query.refetch()} className={`mt-2 ${BUTTON_SECONDARY_COMPACT}`}>Try again</button>
          </div>
        )}

        {data && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <caption className="sr-only">Open, overdue and finished tasks for each member of the group</caption>
              <thead>
                <tr className="border-b border-slate-300 text-slate-900">
                  <th scope="col" className="py-2 pr-3 font-semibold">Member</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Open</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Overdue</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Due this week</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">In review</th>
                  <th scope="col" className="py-2 pl-2 text-right font-semibold">Done</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.members.map((m) => (
                  <tr key={m.userId} className="border-b border-slate-200">
                    <th scope="row" className="py-2 pr-3 font-medium text-slate-900">{m.name}</th>
                    <td className="px-2 py-2 text-right text-slate-900">{m.open}</td>
                    <td className="px-2 py-2 text-right"><Overdue count={m.overdue} /></td>
                    <td className="px-2 py-2 text-right text-slate-900">{m.dueThisWeek}</td>
                    <td className="px-2 py-2 text-right text-slate-900">{m.inReview}</td>
                    <td className="py-2 pl-2 text-right text-slate-900">{m.done}</td>
                  </tr>
                ))}
                <tr className="border-b border-slate-200">
                  <th scope="row" className="py-2 pr-3 font-medium text-slate-900">Unassigned</th>
                  <td className="px-2 py-2 text-right text-slate-900">{data.unassigned.open}</td>
                  <td className="px-2 py-2 text-right"><Overdue count={data.unassigned.overdue} /></td>
                  <td className="px-2 py-2 text-right text-slate-700">–</td>
                  <td className="px-2 py-2 text-right text-slate-700">–</td>
                  <td className="py-2 pl-2 text-right text-slate-700">–</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Close</button>
        </div>
      </div>
    </div>
  );
}

/** A count with an icon and text when it is not zero, so it never relies on color alone. */
function Overdue({ count }: { count: number }) {
  if (count === 0) return <span className="text-slate-900">0</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1 font-semibold text-red-800">
      <AlertTriangleIcon className="h-3.5 w-3.5" />
      <span>{count}<span className="sr-only"> overdue</span></span>
    </span>
  );
}

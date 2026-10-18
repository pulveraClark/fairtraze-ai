import { useQuery } from "@tanstack/react-query";
import type { GroupTaskSummary } from "@shared/taskTypes";
import { useAuth } from "../context/AuthContext";
import { groupKeys } from "../hooks/useGroupQueries";
import { taskApi } from "../lib/tasks/api";
import { formatDue } from "../lib/tasks/dates";
import { useRouter } from "../router";
import { AlertTriangleIcon } from "./tasks/icons";
import { BUTTON_SECONDARY_COMPACT, CARD } from "./ui/styles";

/**
 * "Task progress" on the class page: for each group, how many tasks are done, how many are overdue and how
 * each milestone is going. Planning counts only. Task progress is never part of the contribution score.
 */
export function GroupTaskCards({ assignmentId }: { assignmentId: number }) {
  const { token, user } = useAuth();
  const { navigate } = useRouter();
  const query = useQuery({
    queryKey: groupKeys.assignmentTasks(user?.id ?? null, assignmentId),
    queryFn: () => taskApi.assignmentTaskSummary(token, assignmentId),
    enabled: !!token,
    retry: false,
  });

  if (query.isLoading) return null;
  if (query.isError) {
    return <p role="status" className="text-sm text-slate-700">Task progress could not be loaded.</p>;
  }
  const groups = query.data?.groups ?? [];
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="task-progress-title" className="space-y-3">
      <div>
        <h2 id="task-progress-title" className="text-lg font-semibold text-slate-900">Task progress</h2>
        <p className="text-sm text-slate-800">Planning only. Not part of the contribution score.</p>
      </div>
      <ul className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <li key={g.projectId} className="flex">
            <TaskCard group={g} onNavigate={navigate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskCard({ group, onNavigate }: { group: GroupTaskSummary; onNavigate: (to: string) => void }) {
  const pct = group.total === 0 ? 0 : Math.round((group.done / group.total) * 100);
  const base = `/project/${group.projectId}`;
  return (
    <article className={`${CARD} flex h-full w-full flex-col`} aria-label={`${group.groupName} task progress`}>
      <h3 className="text-sm font-semibold text-slate-900">{group.groupName}</h3>

      {group.total === 0 ? (
        <p className="mt-2 text-sm text-slate-700">No tasks yet.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-900 tabular-nums">{group.done} of {group.total} tasks done</p>
          <span
            role="progressbar"
            aria-label={`${group.groupName} tasks done`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-200"
          >
            <span className="block h-full bg-indigo-700" style={{ width: `${pct}%` }} />
          </span>
          <p className={`mt-2 flex items-center gap-1 text-sm ${group.overdue > 0 ? "font-semibold text-red-800" : "text-slate-800"}`}>
            {group.overdue > 0 && <AlertTriangleIcon className="h-4 w-4" />}
            {group.overdue > 0 ? `${group.overdue} overdue` : "None overdue"}
          </p>
        </>
      )}

      {group.milestones.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Milestones">
          {group.milestones.map((m) => {
            const mp = m.total === 0 ? 0 : Math.round((m.done / m.total) * 100);
            return (
              <li key={m.id}>
                <p className="flex items-baseline justify-between gap-2 text-xs text-slate-800">
                  <span className="truncate font-medium text-slate-900">{m.name}</span>
                  <span className="shrink-0 tabular-nums">{m.done} of {m.total}{m.dueDate ? ` · due ${formatDue(m.dueDate)}` : ""}</span>
                </p>
                <span
                  role="progressbar"
                  aria-label={`${m.name} progress`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={mp}
                  className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-200"
                >
                  <span className="block h-full bg-indigo-700" style={{ width: `${mp}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <button type="button" onClick={() => onNavigate(`${base}?tab=tasks`)} className={BUTTON_SECONDARY_COMPACT}>Open tasks</button>
        <button type="button" onClick={() => onNavigate(`${base}?tab=tasks&workload=1`)} className={BUTTON_SECONDARY_COMPACT}>Workload</button>
        <button type="button" onClick={() => onNavigate(base)} className={BUTTON_SECONDARY_COMPACT}>Open report</button>
      </div>
    </article>
  );
}

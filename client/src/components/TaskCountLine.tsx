import type { GroupTaskSummary } from "@shared/taskTypes";
import { taskCountLabel } from "../lib/tasks/countLabel";
import { AlertTriangleIcon } from "./tasks/icons";

/** One line on a group card: "3 of 8 done" with a thin bar and, when late, "2 overdue" (text + icon). */
export function TaskCountLine({ tasks }: { tasks: Pick<GroupTaskSummary, "done" | "total" | "overdue"> }) {
  const pct = tasks.total === 0 ? 0 : Math.round((tasks.done / tasks.total) * 100);
  return (
    <div title="Planning only. Not part of the contribution score.">
      <p className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-slate-700">
        <span className="tabular-nums"><span className="font-medium text-slate-900">Tasks:</span> {taskCountLabel(tasks.done, tasks.total)}</span>
        {tasks.overdue > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-red-800">
            <AlertTriangleIcon className="h-3.5 w-3.5" />
            {tasks.overdue} overdue
          </span>
        )}
      </p>
      {tasks.total > 0 && (
        <span
          role="progressbar"
          aria-label="Tasks done"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-200"
        >
          <span className="block h-full bg-indigo-700" style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
}

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardResponse, BoardTask, TaskStatus } from "@shared/taskTypes";
import { TASK_STATUS_LABELS } from "@shared/taskTypes";
import { SortableTaskCard } from "./TaskCard";
import { QuickAddTask } from "./QuickAddTask";

export type DropState = "allowed" | "denied" | null;

interface Props {
  status: TaskStatus;
  /** Task ids shown in this column, in order (the live order while dragging). */
  ids: number[];
  tasksById: Map<number, BoardTask>;
  board: BoardResponse;
  today: string;
  onOpen: (taskId: number) => void;
  dropState: DropState;
  /** True while a card is being dragged and this column is not the one it started in. */
  showDropHint: boolean;
  /** Total tasks in this column before filters, to explain an empty filtered column. */
  unfilteredCount: number;
  /** Present only where the viewer may create a task in this column. */
  onQuickAdd?: (title: string) => Promise<string | void>;
}

export function columnId(status: TaskStatus): string {
  return `col:${status}`;
}

export function Column({ status, ids, tasksById, board, today, onOpen, dropState, showDropHint, unfilteredCount, onQuickAdd }: Props) {
  const label = TASK_STATUS_LABELS[status];
  const { setNodeRef } = useDroppable({ id: columnId(status), data: { type: "column", status } });

  const outline =
    dropState === "allowed" ? "outline outline-2 outline-indigo-600"
    : dropState === "denied" ? "outline outline-2 outline-red-700"
    : "";

  return (
    <section
      aria-labelledby={`col-title-${status}`}
      // Fixed width (the board scrolls sideways) below xl; from xl up the columns share the row,
      // never narrower than 14rem (15rem + gaps would overflow the 960px board next to the sidebar), so all four fit next to the open sidebar.
      className={`flex w-[min(18rem,85vw)] shrink-0 flex-col xl:w-auto xl:min-w-[14rem] xl:flex-1 xl:basis-0 rounded-xl bg-slate-100 p-2.5 ${outline}`}
    >
      <header className="flex items-center justify-between gap-2 px-1 pb-2">
        <h3 id={`col-title-${status}`} className="text-sm font-semibold text-slate-900">{label}</h3>
        <span
          className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-800"
          aria-label={`${ids.length} ${ids.length === 1 ? "task" : "tasks"}`}
        >
          {ids.length}
        </span>
      </header>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-12 flex-1 flex-col gap-2" aria-label={`${label} tasks`}>
          {ids.map((id) => {
            const task = tasksById.get(id);
            return task ? <SortableTaskCard key={id} task={task} board={board} today={today} onOpen={onOpen} /> : null;
          })}
        </ul>
      </SortableContext>

      {ids.length === 0 && dropState === null && (
        <p className="px-1 py-2 text-xs text-slate-700">
          {unfilteredCount > 0 ? "No tasks match the filters." : "No tasks here yet."}
        </p>
      )}

      {onQuickAdd && (
        <div className="mt-2">
          <QuickAddTask label={label} onAdd={onQuickAdd} />
        </div>
      )}

      {dropState === "allowed" && showDropHint && (
        <div className="mt-2 rounded-lg border-2 border-dashed border-indigo-600 bg-indigo-50 px-3 py-3 text-center text-sm font-semibold text-indigo-900">
          Drop here
        </div>
      )}
      {dropState === "denied" && (
        <div className="mt-2 rounded-lg border-2 border-dashed border-red-700 bg-red-50 px-3 py-3 text-center text-sm font-semibold text-red-900">
          Not allowed for this task
        </div>
      )}
    </section>
  );
}

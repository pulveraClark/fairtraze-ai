import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TASK_PRIORITY_LABELS, type BoardResponse, type BoardTask } from "@shared/taskTypes";
import { Avatar } from "../Avatar";
import { formatDue, isOverdue } from "../../lib/tasks/dates";
import { LABEL_CHIP_CLASSES, moveDeniedMessage } from "../../lib/tasks/labels";
import { FOCUS_LIGHT } from "../ui/styles";
import {
  AlertTriangleIcon, CalendarIcon, CheckSquareIcon, CommitIcon, FlagIcon, GripIcon, LockIcon, PriorityIcon,
} from "./icons";

interface ViewProps {
  task: BoardTask;
  board: BoardResponse;
  today: string;
  onOpen: (taskId: number) => void;
  /** The grip (can move), a lock (cannot) or nothing (view-only viewer). */
  handle?: ReactNode;
  overlay?: boolean;
}

/** The visual card. Shared by the sortable list item and the drag overlay. */
export function TaskCardView({ task, board, today, onOpen, handle, overlay }: ViewProps) {
  const assignee = board.members.find((m) => m.userId === task.assignedToUserId) ?? null;
  const milestone = board.milestones.find((m) => m.id === task.milestoneId) ?? null;
  const labels = task.labelIds
    .map((id) => board.labels.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l);
  const overdue = isOverdue(task.dueDate, task.status, today);

  return (
    <div
      data-testid={`task-card-${task.id}`}
      className={`rounded-lg border bg-white p-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${
        overlay ? "border-indigo-400 shadow-lg" : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-1.5">
        {handle}
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          data-task-open={task.id}
          className={`min-w-0 flex-1 rounded text-left ${FOCUS_LIGHT}`}
        >
          <span className="block text-xs font-semibold tabular-nums text-slate-700">{task.key}</span>
          <span className="mt-0.5 block break-words font-medium leading-snug text-slate-900">{task.title}</span>
        </button>
      </div>

      {(labels.length > 0 || milestone) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <span key={l.id} className={`inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-xs font-medium ${LABEL_CHIP_CLASSES[l.color]}`}>
              <span className="truncate">{l.name}</span>
            </span>
          ))}
          {milestone && (
            <span className="inline-flex max-w-full items-center gap-1 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-800">
              <FlagIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{milestone.name}</span>
            </span>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-700">
        <span className="inline-flex items-center gap-1">
          <PriorityIcon priority={task.priority} className="h-3.5 w-3.5" />
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
        {task.dueDate && (
          <span className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-red-800" : ""}`}>
            {overdue ? <AlertTriangleIcon className="h-3.5 w-3.5" /> : <CalendarIcon className="h-3.5 w-3.5" />}
            {overdue ? `Overdue · ${formatDue(task.dueDate, today)}` : formatDue(task.dueDate, today)}
          </span>
        )}
        {task.subtasks.total > 0 && (
          <span className="inline-flex items-center gap-1">
            <CheckSquareIcon className="h-3.5 w-3.5" />
            {task.subtasks.done} of {task.subtasks.total}
          </span>
        )}
        {task.commitCount > 0 && (
          <span className="inline-flex items-center gap-1">
            <CommitIcon className="h-3.5 w-3.5" />
            {task.commitCount} {task.commitCount === 1 ? "commit" : "commits"}
          </span>
        )}
        <span className="ml-auto inline-flex items-center" title={assignee ? assignee.name : "Unassigned"}>
          {assignee ? (
            <>
              <Avatar
                userId={assignee.userId}
                name={assignee.name}
                avatarUpdatedAt={assignee.avatarUpdatedAt}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-900"
              />
              <span className="sr-only">Assigned to {assignee.name}</span>
            </>
          ) : (
            <span className="rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-xs text-slate-700">Unassigned</span>
          )}
        </span>
      </div>
    </div>
  );
}

interface SortableProps {
  task: BoardTask;
  board: BoardResponse;
  today: string;
  onOpen: (taskId: number) => void;
}

/** A card inside a column. The grip is the only drag handle (so the title stays clickable and touch scroll works). */
export function SortableTaskCard({ task, board, today, onOpen }: SortableProps) {
  const canMove = task.permissions.move;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task" },
    disabled: !canMove,
  });

  let handle: ReactNode = null;
  if (canMove) {
    handle = (
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${task.key}. Press Space to pick up, arrow keys to move, Space to drop.`}
        className={`-ml-1.5 -mt-1 flex h-11 w-9 shrink-0 cursor-grab touch-none items-center justify-center rounded text-slate-600 hover:bg-slate-100 active:cursor-grabbing ${FOCUS_LIGHT}`}
      >
        <GripIcon className="h-4 w-4" />
      </button>
    );
  } else if (!board.viewer.readOnly) {
    const message = moveDeniedMessage(task, board.members);
    handle = (
      <span
        tabIndex={0}
        role="img"
        aria-label={message}
        title={message}
        className={`-ml-1 mt-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded text-slate-600 ${FOCUS_LIGHT}`}
      >
        <LockIcon className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="list-none"
    >
      <TaskCardView task={task} board={board} today={today} onOpen={onOpen} handle={handle} />
    </li>
  );
}

import { useEffect, useMemo, useRef } from "react";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type BoardResponse, type BoardTask } from "@shared/taskTypes";
import { Avatar } from "../Avatar";
import { formatDue, isOverdue } from "../../lib/tasks/dates";
import { LABEL_CHIP_CLASSES } from "../../lib/tasks/labels";
import { sortTasks, type Sort, type SortKey } from "../../lib/tasks/sort";
import { FOCUS_LIGHT } from "../ui/styles";
import { QuickAddTask } from "./QuickAddTask";
import { AlertTriangleIcon, CalendarIcon, ChevronDownIcon, ChevronUpIcon, FlagIcon, PriorityIcon } from "./icons";

interface Props {
  board: BoardResponse;
  /** Tasks that pass the current filters. */
  tasks: BoardTask[];
  today: string;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  onOpen: (taskId: number) => void;
  /** Present only for the leader: the ticked task ids and how to change them. */
  /** Quick add above the table (creates in To do). */
  onQuickAdd?: (title: string) => Promise<string | void>;
  selection?: { ids: Set<number>; onToggle: (id: number) => void; onSetAll: (ids: number[] | null) => void };
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "key", label: "Key" },
  { key: "title", label: "Title" },
  { key: "assignee", label: "Assignee" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "due", label: "Due" },
  { key: "milestone", label: "Milestone" },
  { key: "labels", label: "Labels" },
];

/** Sortable table of the tasks. It scrolls inside its own box, so the page never scrolls sideways. */
export function ListView({ board, tasks, today, sort, onSortChange, onOpen, selection, onQuickAdd }: Props) {
  const rows = useMemo(() => sortTasks(tasks, sort, board), [tasks, sort, board]);
  const allRef = useRef<HTMLInputElement>(null);
  const ticked = selection ? rows.filter((t) => selection.ids.has(t.id)).length : 0;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = ticked > 0 && ticked < rows.length;
  }, [ticked, rows.length]);

  function clickHeader(key: SortKey) {
    onSortChange(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  const quickAdd = onQuickAdd && (
    <div className="max-w-sm">
      <QuickAddTask label="To do" onAdd={onQuickAdd} />
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        {quickAdd}
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-800">No tasks match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
    {quickAdd}
    <div role="region" aria-label="Task list" tabIndex={0} className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${FOCUS_LIGHT}`}>
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {selection && (
              <th scope="col" className="w-10 px-3">
                <input
                  ref={allRef}
                  type="checkbox"
                  aria-label={`Select all ${rows.length} tasks`}
                  checked={ticked === rows.length}
                  onChange={() => selection.onSetAll(ticked === rows.length ? null : rows.map((t) => t.id))}
                  className="h-4 w-4"
                />
              </th>
            )}
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => clickHeader(c.key)}
                    className={`flex min-h-10 w-full items-center gap-1 px-3 text-left text-xs font-semibold text-slate-900 hover:bg-slate-100 ${FOCUS_LIGHT}`}
                  >
                    {c.label}
                    {active
                      ? (sort.dir === "asc" ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />)
                      : <span className="inline-block h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((t) => (
            <Row key={t.id} task={t} board={board} today={today} onOpen={onOpen} selection={selection} />
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

function Row({ task, board, today, onOpen, selection }: { task: BoardTask; board: BoardResponse; today: string; onOpen: (id: number) => void; selection?: Props["selection"] }) {
  const assignee = board.members.find((m) => m.userId === task.assignedToUserId) ?? null;
  const milestone = board.milestones.find((m) => m.id === task.milestoneId) ?? null;
  const labels = task.labelIds.map((id) => board.labels.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => !!l);
  const overdue = isOverdue(task.dueDate, task.status, today);
  const checked = selection?.ids.has(task.id) ?? false;

  return (
    <tr data-testid={`task-row-${task.id}`} className={checked ? "bg-indigo-50" : "hover:bg-slate-50"}>
      {selection && (
        <td className="px-3">
          <input type="checkbox" aria-label={`Select ${task.key}`} checked={checked} onChange={() => selection.onToggle(task.id)} className="h-4 w-4" />
        </td>
      )}
      <td className="whitespace-nowrap px-3 text-xs font-semibold tabular-nums text-slate-700">{task.key}</td>
      <td className="max-w-xs px-1 py-1">
        <button
          type="button"
          data-task-open={task.id}
          onClick={() => onOpen(task.id)}
          className={`min-h-10 w-full rounded px-2 text-left font-medium text-slate-900 hover:underline ${FOCUS_LIGHT}`}
        >
          {task.title}
        </button>
      </td>
      <td className="whitespace-nowrap px-3">
        {assignee ? (
          <span className="inline-flex items-center gap-2">
            <Avatar
              userId={assignee.userId}
              name={assignee.name}
              avatarUpdatedAt={assignee.avatarUpdatedAt}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-900"
            />
            {assignee.name}
          </span>
        ) : (
          <span className="text-slate-700">Unassigned</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3">{TASK_STATUS_LABELS[task.status]}</td>
      <td className="whitespace-nowrap px-3">
        <span className="inline-flex items-center gap-1">
          <PriorityIcon priority={task.priority} className="h-3.5 w-3.5" />
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 tabular-nums">
        {task.dueDate ? (
          <span className={`inline-flex items-center gap-1 ${overdue ? "font-semibold text-red-800" : ""}`}>
            {overdue ? <AlertTriangleIcon className="h-3.5 w-3.5" /> : <CalendarIcon className="h-3.5 w-3.5" />}
            {overdue ? `Overdue · ${formatDue(task.dueDate, today)}` : formatDue(task.dueDate, today)}
          </span>
        ) : (
          <span className="text-slate-700">No date</span>
        )}
      </td>
      <td className="px-3">
        {milestone ? (
          <span className="inline-flex items-center gap-1">
            <FlagIcon className="h-3 w-3 shrink-0" />
            {milestone.name}
          </span>
        ) : (
          <span className="text-slate-700">None</span>
        )}
      </td>
      <td className="px-3">
        <div className="flex flex-wrap gap-1">
          {labels.length === 0 && <span className="text-slate-700">None</span>}
          {labels.map((l) => (
            <span key={l.id} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${LABEL_CHIP_CLASSES[l.color]}`}>{l.name}</span>
          ))}
        </div>
      </td>
    </tr>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import type { Announcements, DragEndEvent, KeyboardCoordinateGetter } from "@dnd-kit/core";
import type { BoardResponse, BoardTask } from "@shared/taskTypes";
import {
  addDays, addMonths, formatLongDate, formatMonth, isOverdue, manilaDateOf, monthGrid, monthOf,
} from "../../lib/tasks/dates";
import { BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";
import { AlertTriangleIcon, CalendarIcon, CheckSquareIcon, ChevronLeftIcon, ChevronRightIcon, FlagIcon, StarIcon } from "./icons";

interface Props {
  board: BoardResponse;
  /** Tasks that pass the current filters. */
  tasks: BoardTask[];
  today: string;
  onOpen: (taskId: number) => void;
  /** Drop on another day. The page saves it (the server checks permission) and offers Undo. */
  onReschedule: (task: BoardTask, date: string) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dayId = (date: string) => `day:${date}`;

/** The first day to put focus on in a month: today if it is in that month, else the 1st. */
function entryDay(month: string, today: string): string {
  return monthOf(today) === month ? today : `${month}-01`;
}

/**
 * A month grid (Sunday to Saturday). Arrow keys move between days (roving tabindex), Enter opens the
 * first task of the day, and a task can be dragged to another day to change its due date. Dates are
 * calendar dates in Asia/Manila; nothing here builds a local-time Date.
 */
export function CalendarView({ board, tasks, today, onOpen, onReschedule }: Props) {
  const [month, setMonth] = useState(() => monthOf(today));
  const [activeDay, setActiveDay] = useState(() => entryDay(monthOf(today), today));
  const [dragId, setDragId] = useState<number | null>(null);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const focusAfterRender = useRef(false);

  const coordinateGetter: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const box = cellRefs.current.values().next().value?.getBoundingClientRect();
    const w = box?.width ?? 112;
    const h = box?.height ?? 112;
    const { x, y } = currentCoordinates;
    switch (event.code) {
      case "ArrowRight": return { x: x + w, y };
      case "ArrowLeft": return { x: x - w, y };
      case "ArrowDown": return { x, y: y + h };
      case "ArrowUp": return { x, y: y - h };
      default: return undefined;
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Space picks up and drops (Enter stays "open the task"); the arrows move one day or one week.
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] }, coordinateGetter }),
  );

  const weeks = useMemo(() => monthGrid(month), [month]);
  const days = useMemo(() => weeks.flat(), [weeks]);

  const byDay = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      map.set(t.dueDate, [...(map.get(t.dueDate) ?? []), t].sort((a, b) => a.number - b.number));
    }
    return map;
  }, [tasks]);
  const milestonesByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of board.milestones) {
      if (m.dueDate) map.set(m.dueDate, [...(map.get(m.dueDate) ?? []), m.name]);
    }
    return map;
  }, [board.milestones]);
  const deadline = board.group.deadline ? manilaDateOf(board.group.deadline) : null;
  const undated = tasks.filter((t) => !t.dueDate).length;
  const dragTask = dragId !== null ? tasks.find((t) => t.id === dragId) ?? null : null;

  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    cellRefs.current.get(activeDay)?.focus();
  }, [activeDay, month]);

  function goToMonth(next: string) {
    setMonth(next);
    setActiveDay(entryDay(next, today));
  }

  function moveFocus(date: string) {
    focusAfterRender.current = true;
    setActiveDay(date);
    if (!days.includes(date)) setMonth(monthOf(date));
  }

  function onCellKeyDown(e: React.KeyboardEvent, date: string) {
    if (e.target !== e.currentTarget) return; // keys inside a task button belong to the button
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      moveFocus(addDays(date, step[e.key]!));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const next = addMonths(monthOf(date), e.key === "PageUp" ? -1 : 1);
      const [y, m] = next.split("-").map(Number) as [number, number];
      const length = new Date(Date.UTC(y, m, 0)).getUTCDate(); // days in that month
      moveFocus(`${next}-${String(Math.min(Number(date.slice(8)), length)).padStart(2, "0")}`);
    } else if (e.key === "Enter") {
      const first = byDay.get(date)?.[0];
      if (first) {
        e.preventDefault();
        onOpen(first.id);
      }
    }
  }

  const taskOf = (id: unknown) => tasks.find((t) => t.id === Number(String(id).replace("task:", "")));
  const dayOf = (id: unknown) => (String(id).startsWith("day:") ? formatLongDate(String(id).slice(4)) : null);
  const announcements: Announcements = {
    onDragStart: ({ active }) => (taskOf(active.id) ? `Picked up ${taskOf(active.id)!.key}.` : undefined),
    onDragOver: ({ active, over }) => (over && dayOf(over.id) ? `${taskOf(active.id)?.key ?? "Task"} is over ${dayOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over && dayOf(over.id) ? `Dropped ${taskOf(active.id)?.key ?? "task"} on ${dayOf(over.id)}.` : `Dropped ${taskOf(active.id)?.key ?? "task"}.`),
    onDragCancel: ({ active }) => `Move cancelled. ${taskOf(active.id)?.key ?? "The task"} keeps its due date.`,
  };

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const task = tasks.find((t) => t.id === Number(String(e.active.id).replace("task:", "")));
    const over = e.over ? String(e.over.id) : "";
    if (task && over.startsWith("day:") && over.slice(4) !== task.dueDate) onReschedule(task, over.slice(4));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="calendar-month" aria-live="polite" className="min-w-[10rem] text-lg font-semibold text-slate-900">{formatMonth(month)}</h3>
        <button type="button" aria-label="Previous month" onClick={() => goToMonth(addMonths(month, -1))} className={BUTTON_SECONDARY_COMPACT}>
          <ChevronLeftIcon />
        </button>
        <button type="button" onClick={() => goToMonth(monthOf(today))} className={BUTTON_SECONDARY_COMPACT}>Today</button>
        <button type="button" aria-label="Next month" onClick={() => goToMonth(addMonths(month, 1))} className={BUTTON_SECONDARY_COMPACT}>
          <ChevronRightIcon />
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} accessibility={{ announcements, screenReaderInstructions: { draggable: "Press Space to pick up a task, the arrow keys to choose a day, Space to drop it, and Escape to cancel." } }} onDragStart={(e) => setDragId(Number(String(e.active.id).replace("task:", "")))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <div role="region" aria-label="Task calendar" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div role="grid" aria-labelledby="calendar-month" className="min-w-[49rem]">
            <div role="row" className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader" className="px-2 py-1.5 text-xs font-semibold text-slate-900">{d}</div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} role="row" className="grid grid-cols-7">
                {week.map((date) => (
                  <DayCell
                    key={date}
                    date={date}
                    inMonth={monthOf(date) === month}
                    isToday={date === today}
                    isDeadline={date === deadline}
                    milestones={milestonesByDay.get(date) ?? []}
                    tasks={byDay.get(date) ?? []}
                    today={today}
                    roving={date === activeDay}
                    setRef={(el) => { if (el) cellRefs.current.set(date, el); else cellRefs.current.delete(date); }}
                    onFocusDay={() => setActiveDay(date)}
                    onKeyDown={(e) => onCellKeyDown(e, date)}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <DragOverlay>
          {dragTask ? <TaskChip task={dragTask} today={today} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-800" aria-label="Legend">
        <li className="inline-flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" /> Due</li>
        <li className="inline-flex items-center gap-1 font-semibold text-red-800"><AlertTriangleIcon className="h-3.5 w-3.5" /> Overdue</li>
        <li className="inline-flex items-center gap-1"><StarIcon className="h-3.5 w-3.5 text-amber-700" /> Milestone due</li>
        <li className="inline-flex items-center gap-1"><CheckSquareIcon className="h-3.5 w-3.5" /> Done</li>
        <li className="inline-flex items-center gap-1"><FlagIcon className="h-3.5 w-3.5" /> Project deadline</li>
      </ul>
      {undated > 0 && (
        <p className="text-sm text-slate-700">{undated} {undated === 1 ? "task has" : "tasks have"} no due date and {undated === 1 ? "is" : "are"} not on the calendar.</p>
      )}
    </div>
  );
}

interface CellProps {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isDeadline: boolean;
  milestones: string[];
  tasks: BoardTask[];
  today: string;
  roving: boolean;
  setRef: (el: HTMLDivElement | null) => void;
  onFocusDay: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onOpen: (taskId: number) => void;
}

function DayCell({ date, inMonth, isToday, isDeadline, milestones, tasks, today, roving, setRef, onFocusDay, onKeyDown, onOpen }: CellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayId(date) });
  const dayNumber = Number(date.slice(8));
  const summary = [
    formatLongDate(date),
    isToday ? "today" : "",
    isDeadline ? "project deadline" : "",
    ...milestones.map((m) => `milestone ${m} due`),
    tasks.length ? `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} due` : "",
  ].filter(Boolean).join(", ");

  return (
    <div
      ref={(el) => { setNodeRef(el); setRef(el); }}
      role="gridcell"
      tabIndex={roving ? 0 : -1}
      aria-label={summary}
      data-date={date}
      onFocus={(e) => { if (e.target === e.currentTarget) onFocusDay(); }}
      onKeyDown={onKeyDown}
      className={`min-h-28 border-b border-r border-slate-200 p-1.5 text-sm ${FOCUS_LIGHT} ${
        isOver ? "bg-indigo-50" : inMonth ? "bg-white" : "bg-slate-50"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          data-no-coarse="" className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ${
            isToday ? "bg-indigo-700 text-white" : inMonth ? "text-slate-900" : "text-slate-700"
          }`}
        >
          {dayNumber}
          {isToday && <span className="sr-only"> (today)</span>}
        </span>
        {isDeadline && (
          <span className="inline-flex items-center gap-0.5 rounded bg-slate-900 px-1 text-xs font-semibold text-white">
            <FlagIcon className="h-3 w-3" /> Deadline
          </span>
        )}
      </div>
      <div className="mt-1 space-y-1">
        {milestones.map((name) => (
          <p key={name} className="flex items-center gap-1 text-xs font-medium text-amber-900">
            <StarIcon className="h-3 w-3 shrink-0 text-amber-700" />
            <span className="truncate">{name}</span>
          </p>
        ))}
        {tasks.map((t) => (
          <TaskChip key={t.id} task={t} today={today} onOpen={onOpen} tabbable={roving} />
        ))}
      </div>
    </div>
  );
}

function TaskChip({ task, today, onOpen, tabbable, overlay }: { task: BoardTask; today: string; onOpen?: (id: number) => void; tabbable?: boolean; overlay?: boolean }) {
  const canDrag = task.permissions.setDue && !overlay;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}`, disabled: !canDrag });
  const done = task.status === "DONE";
  const overdue = isOverdue(task.dueDate, task.status, today);
  const tone = overdue ? "border-red-300 bg-red-50 text-red-900" : done ? "border-slate-300 bg-slate-100 text-slate-800" : "border-indigo-200 bg-indigo-50 text-indigo-950";
  const Icon = overdue ? AlertTriangleIcon : done ? CheckSquareIcon : CalendarIcon;
  const state = overdue ? "overdue" : done ? "done" : "due";

  return (
    <button
      type="button"
      ref={setNodeRef}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      data-task-open={overlay ? undefined : task.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${task.key} ${task.title}, ${state}${canDrag ? ". Drag to another day to change the due date." : ""}`}
      title={canDrag ? "Drag to another day to change the due date" : undefined}
      onClick={() => onOpen?.(task.id)}
      data-no-coarse="" className={`flex min-h-6 w-full items-center gap-1 rounded border px-1 py-0.5 text-left text-xs font-medium ${tone} ${canDrag ? "cursor-grab touch-none" : ""} ${isDragging ? "opacity-40" : ""} ${FOCUS_LIGHT}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className={`truncate ${done ? "line-through" : ""}`}>{task.title}</span>
    </button>
  );
}

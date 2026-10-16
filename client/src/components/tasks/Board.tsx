import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors,
} from "@dnd-kit/core";
import type { Announcements, DragEndEvent, DragOverEvent, DragStartEvent, UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { TASK_STATUSES, TASK_STATUS_LABELS, type BoardResponse, type BoardTask, type TaskStatus } from "@shared/taskTypes";
import { Column, type DropState } from "./Column";
import { TaskCardView } from "./TaskCard";
import { denyMessage } from "../../lib/tasks/board";
import {
  columnsFromTasks, moveInColumns, placementOf, samePlacement, statusOfTask, type Columns, type Placement,
} from "../../lib/tasks/placement";

interface Props {
  board: BoardResponse;
  /** Tasks that pass the current filters. */
  tasks: BoardTask[];
  today: string;
  onOpen: (taskId: number) => void;
  onMove: (task: BoardTask, to: Placement, previous: Placement | null) => void;
  onQuickAdd: (status: TaskStatus, title: string) => Promise<void>;
  onDenied: (message: string) => void;
}

const INSTRUCTIONS =
  "To pick up a task, focus its grip and press Space. Use the arrow keys to move it between and inside columns, " +
  "Space to drop it, and Escape to cancel.";

function statusOfContainer(id: UniqueIdentifier): TaskStatus | null {
  const s = String(id);
  return s.startsWith("col:") ? (s.slice(4) as TaskStatus) : null;
}

/**
 * The four columns. Cards move with mouse, touch or keyboard; the move is applied optimistically
 * and saved through `onMove`. A card can only be dropped where the server would allow it
 * (`task.permissions.allowedStatuses`); anything else snaps back with an explanation.
 */
export function Board({ board, tasks, today, onOpen, onMove, onQuickAdd, onDenied }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const restingColumns = useMemo(() => columnsFromTasks(tasks), [tasks]);
  const unfilteredCounts = useMemo(() => {
    const counts = { TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 } as Record<TaskStatus, number>;
    for (const t of board.tasks) counts[t.status] += 1;
    return counts;
  }, [board.tasks]);

  // While a card is dragged, the columns are kept here so the card visibly moves between them.
  const [live, setLive] = useState<Columns | null>(null);
  const liveRef = useRef<Columns | null>(null);
  const startRef = useRef<{ id: number; placement: Placement | null; status: TaskStatus } | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);

  const columns = live ?? restingColumns;
  const activeTask = activeId !== null ? tasksById.get(activeId) ?? null : null;
  const isLeader = board.viewer.isLeader;

  const setLiveColumns = useCallback((next: Columns | null) => {
    liveRef.current = next;
    setLive(next);
  }, []);

  const allowed = useCallback(
    (task: BoardTask, to: TaskStatus) => task.permissions.allowedStatuses.includes(to),
    [],
  );
  const assigneeName = useCallback(
    (task: BoardTask) => board.members.find((m) => m.userId === task.assignedToUserId)?.name ?? null,
    [board.members],
  );

  function containerOf(id: UniqueIdentifier, cols: Columns): TaskStatus | null {
    return statusOfContainer(id) ?? statusOfTask(cols, Number(id));
  }

  function handleDragStart(e: DragStartEvent) {
    const id = Number(e.active.id);
    startRef.current = { id, placement: placementOf(restingColumns, id), status: statusOfTask(restingColumns, id)! };
    setActiveId(id);
    setOverStatus(statusOfTask(restingColumns, id));
    setLiveColumns(restingColumns);
  }

  function handleDragOver(e: DragOverEvent) {
    const cols = liveRef.current;
    const { active, over } = e;
    if (!cols || !over) return;
    const id = Number(active.id);
    const task = tasksById.get(id);
    if (!task) return;
    const from = statusOfTask(cols, id);
    const to = containerOf(over.id, cols);
    if (!from || !to) return;
    setOverStatus(to);
    if (from === to) return;
    if (!allowed(task, to)) return; // stay where we are; the column shows "Not allowed"

    const overIsTask = statusOfContainer(over.id) === null;
    const overIndex = overIsTask ? cols[to].indexOf(Number(over.id)) : cols[to].length;
    const activeRect = active.rect.current.translated;
    const below = overIsTask && activeRect ? activeRect.top > over.rect.top + over.rect.height / 2 : false;
    setLiveColumns(moveInColumns(cols, id, to, overIndex + (below ? 1 : 0)));
  }

  function finish(e: DragEndEvent | null) {
    const start = startRef.current;
    let cols = liveRef.current;
    startRef.current = null;
    setActiveId(null);
    setOverStatus(null);
    // Escape / cancel: put everything back and report nothing, even if the card had been moved on screen.
    if (!start || !cols || e === null) { setLiveColumns(null); return; }
    const task = tasksById.get(start.id);

    if (e.over && task) {
      const targetStatus = containerOf(e.over.id, cols);
      if (targetStatus && !allowed(task, targetStatus)) {
        onDenied(denyMessage(task, targetStatus, isLeader, assigneeName(task)) || "You cannot move this task there.");
      } else {
        // Reorder inside the same column: the sortable strategy only previews it, so apply it now.
        const current = statusOfTask(cols, start.id);
        if (current && targetStatus === current && String(e.over.id) !== String(start.id) && statusOfContainer(e.over.id) === null) {
          const list = cols[current];
          const from = list.indexOf(start.id);
          const to = list.indexOf(Number(e.over.id));
          if (from >= 0 && to >= 0 && from !== to) cols = { ...cols, [current]: arrayMove(list, from, to) };
        }
      }
    }

    const next = placementOf(cols, start.id);
    setLiveColumns(null);
    if (task && next && !samePlacement(next, start.placement)) onMove(task, next, start.placement);
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      const t = tasksById.get(Number(active.id));
      return t ? `Picked up ${t.key}, ${t.title}.` : undefined;
    },
    onDragOver({ active, over }) {
      const cols = liveRef.current;
      const t = tasksById.get(Number(active.id));
      if (!t || !over || !cols) return undefined;
      const to = containerOf(over.id, cols);
      if (!to) return undefined;
      if (!allowed(t, to)) return `${TASK_STATUS_LABELS[to]} is not allowed for ${t.key}.`;
      const index = cols[to].indexOf(t.id);
      return `${t.key} is over ${TASK_STATUS_LABELS[to]}, position ${index + 1} of ${Math.max(cols[to].length, 1)}.`;
    },
    onDragEnd({ active, over }) {
      const t = tasksById.get(Number(active.id));
      if (!t) return undefined;
      const to = over && liveRef.current ? containerOf(over.id, liveRef.current) : null;
      return to ? `Dropped ${t.key} in ${TASK_STATUS_LABELS[to]}.` : `Dropped ${t.key}.`;
    },
    onDragCancel({ active }) {
      const t = tasksById.get(Number(active.id));
      return t ? `Move cancelled. ${t.key} stays where it was.` : undefined;
    },
  };

  const originStatus = startRef.current?.status ?? null;

  function dropStateFor(status: TaskStatus): DropState {
    if (activeTask === null || overStatus !== status) return null;
    return allowed(activeTask, status) ? "allowed" : "denied";
  }

  const canQuickAdd = (status: TaskStatus) =>
    board.viewer.canCreate && (isLeader || status === "TODO");

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={(e) => finish(e)}
      onDragCancel={() => finish(null)}
    >
      <div
        className="flex gap-3 overflow-x-auto pb-3"
        role="region"
        aria-label="Task board"
        tabIndex={-1}
      >
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            ids={columns[status]}
            tasksById={tasksById}
            board={board}
            today={today}
            onOpen={onOpen}
            onQuickAdd={canQuickAdd(status) ? (title) => onQuickAdd(status, title) : null}
            dropState={dropStateFor(status)}
            showDropHint={originStatus !== status}
            unfilteredCount={unfilteredCounts[status]}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCardView task={activeTask} board={board} today={today} onOpen={() => undefined} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

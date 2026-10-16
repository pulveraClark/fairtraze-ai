import { useCallback, useMemo, useRef, useState } from "react";
import type { BoardTask, TaskStatus } from "@shared/taskTypes";
import { useTaskBoardQuery } from "../../hooks/useGroupQueries";
import { useTaskActions } from "../../hooks/useTaskActions";
import { useAuth } from "../../context/AuthContext";
import { filterTasks, NO_FILTERS, type TaskFilters } from "../../lib/tasks/filters";
import { todayManila } from "../../lib/tasks/dates";
import type { Placement } from "../../lib/tasks/placement";
import { BUTTON_SECONDARY_COMPACT } from "../ui/styles";
import { Board } from "./Board";
import { MilestoneStrip } from "./MilestoneStrip";
import { NewTaskDialog } from "./NewTaskDialog";
import { TaskPanel } from "./TaskPanel";
import { TasksTopBar } from "./TasksTopBar";

interface Props {
  projectId: number;
  /** A task to open on mount (from ?task=). */
  initialTaskId?: number | null;
  /** Called when the open task changes, so the page can keep ?task= in the URL. */
  onOpenTaskChange?: (taskId: number | null) => void;
}

/** The group's Tasks tab. Instructors and admins see the same board read-only (the server decides). */
export function TasksTab({ projectId, initialTaskId = null, onOpenTaskChange }: Props) {
  const { user } = useAuth();
  const query = useTaskBoardQuery(projectId);
  const actions = useTaskActions(projectId);
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [openId, setOpenId] = useState<number | null>(initialTaskId);
  const [newTask, setNewTask] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const board = query.data;
  const today = todayManila();

  const visible = useMemo(
    () => (board ? filterTasks(board.tasks, filters, { userId: user?.id ?? 0, today }) : []),
    [board, filters, user?.id, today],
  );

  const open = useCallback((id: number | null) => {
    if (id !== null) openerRef.current = document.activeElement as HTMLElement | null;
    setOpenId(id);
    onOpenTaskChange?.(id);
  }, [onOpenTaskChange]);

  if (query.isLoading) return <p className="py-6 text-sm text-slate-700">Loading tasks…</p>;
  if (query.isError || !board) {
    return (
      <div className="py-6" role="alert">
        <p className="text-sm font-medium text-red-800">Could not load tasks.</p>
        <button type="button" onClick={() => void query.refetch()} className={`mt-2 ${BUTTON_SECONDARY_COMPACT}`}>Try again</button>
      </div>
    );
  }

  const openTask: BoardTask | null = openId !== null ? board.tasks.find((t) => t.id === openId) ?? null : null;

  async function quickAdd(status: TaskStatus, title: string) {
    await actions.createTask({ title }, status);
  }

  function onMove(task: BoardTask, to: Placement, previous: Placement | null) {
    void actions.moveTask(task, to, { previous });
  }

  return (
    <div className="min-w-0 space-y-4">
      {board.viewer.readOnly && (
        <p className="text-sm font-medium text-slate-800">View only. Task progress is for planning and is not part of the contribution score.</p>
      )}

      <TasksTopBar
        board={board}
        filters={filters}
        onChange={setFilters}
        shown={visible.length}
        total={board.tasks.length}
        onNewTask={() => setNewTask(true)}
      />

      <MilestoneStrip
        board={board}
        selectedId={filters.milestoneId}
        onSelect={(id) => setFilters({ ...filters, milestoneId: id })}
        onCreate={async (input) => {
          await actions.createMilestone(input);
        }}
      />

      <Board
        board={board}
        tasks={visible}
        today={today}
        onOpen={open}
        onMove={onMove}
        onQuickAdd={quickAdd}
        onDenied={actions.showError}
      />

      <p className="text-sm text-slate-700">Tasks help your group plan. They don't change contribution scores.</p>

      {openTask && (
        <TaskPanel
          board={board}
          task={openTask}
          actions={actions}
          onClose={() => open(null)}
          restoreFocusTo={openerRef.current}
        />
      )}
      {openId !== null && !openTask && (
        <p role="status" className="text-sm text-slate-700">That task is no longer on this board.</p>
      )}

      {newTask && (
        <NewTaskDialog
          board={board}
          actions={actions}
          onClose={() => setNewTask(false)}
          onCreated={() => setNewTask(false)}
        />
      )}
    </div>
  );
}

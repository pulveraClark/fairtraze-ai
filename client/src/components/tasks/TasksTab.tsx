import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TASK_STATUSES, type BoardTask, type BulkAction, type BulkSkipped } from "@shared/taskTypes";
import { useTaskBoardQuery } from "../../hooks/useGroupQueries";
import { useTaskActions } from "../../hooks/useTaskActions";
import { useTaskShortcuts } from "../../hooks/useTaskShortcuts";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { filterTasks, NO_FILTERS, type TaskFilters } from "../../lib/tasks/filters";
import { formatDue, todayManila } from "../../lib/tasks/dates";
import type { Placement } from "../../lib/tasks/placement";
import { columnsFromTasks } from "../../lib/tasks/placement";
import { confirmQuestion, needsConfirm, resultMessage } from "../../lib/tasks/bulk";
import { DEFAULT_SORT, sortTasks, type Sort } from "../../lib/tasks/sort";
import { clearViewFromUrl, initialView, storeView, syncViewToUrl, type TaskView } from "../../lib/tasks/view";
import { TaskApiError } from "../../lib/tasks/api";
import { BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";
import { Board } from "./Board";
import { BulkBar } from "./BulkBar";
import { BulkConfirmDialog, BulkSkippedDialog } from "./BulkDialogs";
import { CalendarView } from "./CalendarView";
import { ListView } from "./ListView";
import { MilestoneStrip } from "./MilestoneStrip";
import { NewTaskDialog } from "./NewTaskDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { TaskDetailsModal } from "./details/TaskDetailsModal";
import { TasksTopBar } from "./TasksTopBar";

interface Props {
  projectId: number;
  /** A task to open on mount (from ?task=). */
  initialTaskId?: number | null;
  /** Called when the open task changes, so the page can keep ?task= in the URL. */
  onOpenTaskChange?: (taskId: number | null) => void;
  /**
   * Opens the group's Document tab at the heading a task is linked to. Only passed when the group has
   * a Document tab; without it the details window offers no heading link.
   */
  onOpenDocument?: (task: BoardTask) => void;
}

/** The group's Tasks tab. Instructors and admins see the same board read-only (the server decides). */
export function TasksTab({ projectId, initialTaskId = null, onOpenTaskChange, onOpenDocument }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const query = useTaskBoardQuery(projectId);
  const actions = useTaskActions(projectId);
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [openId, setOpenId] = useState<number | null>(initialTaskId);
  const [newTask, setNewTask] = useState(false);
  const [help, setHelp] = useState(false);
  const [view, setView] = useState<TaskView>(() => initialView(user?.id ?? null));
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pending, setPending] = useState<{ action: BulkAction; ids: number[] } | null>(null);
  const [skippedInfo, setSkippedInfo] = useState<BulkSkipped[] | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const board = query.data;
  const today = todayManila();

  const visible = useMemo(
    () => (board ? filterTasks(board.tasks, filters, { userId: user?.id ?? 0, today }) : []),
    [board, filters, user?.id, today],
  );

  const canBulk = !!board && board.viewer.canManageBoard && !board.viewer.readOnly;
  // Only tasks that are on screen count as selected: one that a filter or the 10 s refresh removed
  // must never be edited unseen.
  const selectedIds = useMemo(() => visible.filter((t) => selected.has(t.id)).map((t) => t.id), [visible, selected]);

  // Keep ?view= in the address bar while the Tasks tab is showing, and take it out when it leaves.
  useEffect(() => {
    syncViewToUrl(view);
    return () => clearViewFromUrl();
  }, [view]);

  function changeView(next: TaskView) {
    setView(next);
    storeView(user?.id ?? null, next);
  }

  const open = useCallback((id: number | null) => {
    if (id !== null) openerRef.current = document.activeElement as HTMLElement | null;
    setOpenId(id);
    onOpenTaskChange?.(id);
  }, [onOpenTaskChange]);

  /** Move to another task inside the open details window (the opener to return focus to stays the same). */
  const navigate = useCallback((id: number) => {
    setOpenId(id);
    onOpenTaskChange?.(id);
  }, [onOpenTaskChange]);

  /** Task ids in the order J / K walks them: what the current view shows, top to bottom. */
  const orderedIds = useMemo(() => {
    if (!board) return [];
    if (view === "list") return sortTasks(visible, sort, board).map((t) => t.id);
    if (view === "calendar") {
      return visible.filter((t) => t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.number - b.number).map((t) => t.id);
    }
    const cols = columnsFromTasks(visible);
    return TASK_STATUSES.flatMap((s) => cols[s]);
  }, [board, view, visible, sort]);

  useTaskShortcuts({
    create: board?.viewer.canCreate ? () => setNewTask(true) : undefined,
    search: () => { searchRef.current?.focus(); searchRef.current?.select(); },
    help: () => setHelp(true),
    step: (direction) => {
      const current = (document.activeElement as HTMLElement | null)?.closest("[data-task-open]")?.getAttribute("data-task-open");
      const at = current ? orderedIds.indexOf(Number(current)) : -1;
      const next = at < 0 ? (direction > 0 ? 0 : orderedIds.length - 1) : Math.min(Math.max(at + direction, 0), orderedIds.length - 1);
      const id = orderedIds[next];
      if (id === undefined) return;
      const el = document.querySelector<HTMLElement>(`[data-task-open="${id}"]`);
      el?.focus();
      el?.scrollIntoView?.({ block: "nearest" });
    },
    escape: selectedIds.length ? () => setSelected(new Set()) : undefined,
  });

  async function runBulk(action: BulkAction, ids: number[]) {
    if (!board) return;
    setBulkBusy(true);
    const res = await actions.bulkEdit(ids, action);
    setBulkBusy(false);
    if (!res) return;
    const message = resultMessage(action, ids.length, res, board);
    showToast({ message, tone: res.skipped.length ? "error" : "success" });
    // Keep only the skipped tasks ticked, so the leader can see what is left.
    setSelected(new Set(res.skipped.map((s) => s.taskId)));
    if (res.skipped.length) setSkippedInfo(res.skipped);
  }

  function onBulkAction(action: BulkAction) {
    if (selectedIds.length === 0) return;
    if (needsConfirm(action)) setPending({ action, ids: selectedIds });
    else void runBulk(action, selectedIds);
  }

  /** Drag on the calendar: change only the due date, offer Undo. The server checks permission. */
  async function reschedule(task: BoardTask, date: string) {
    const before = task.dueDate;
    try {
      const saved = await actions.updateTask(task, { dueDate: date });
      showToast({
        message: `Due date for ${saved.key} set to ${formatDue(date, today)}.`,
        actionLabel: "Undo",
        onAction: () => {
          void actions.updateTask(saved, { dueDate: before })
            .then(() => showToast({ message: "Due date restored." }))
            .catch((err) => actions.showError(err instanceof Error ? err.message : "Could not restore the due date."));
        },
      });
    } catch (err) {
      // A version conflict has already been explained by the action.
      if (!(err instanceof TaskApiError && err.isConflict)) {
        actions.showError(err instanceof Error ? err.message : "Could not change the due date.");
      }
    }
  }

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

  function onMove(task: BoardTask, to: Placement, previous: Placement | null) {
    void actions.moveTask(task, to, { previous });
  }

  function toggleSelected(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
        view={view}
        onViewChange={changeView}
        searchRef={searchRef}
      />

      <MilestoneStrip
        board={board}
        selectedId={filters.milestoneId}
        onSelect={(id) => setFilters({ ...filters, milestoneId: id })}
        onCreate={async (input) => {
          await actions.createMilestone(input);
        }}
      />

      {view === "board" && (
        <Board
          board={board}
          tasks={visible}
          today={today}
          onOpen={open}
          onMove={onMove}
          onDenied={actions.showError}
        />
      )}

      {view === "list" && (
        <>
          <ListView
            board={board}
            tasks={visible}
            today={today}
            sort={sort}
            onSortChange={setSort}
            onOpen={open}
            selection={canBulk ? {
              ids: new Set(selectedIds),
              onToggle: toggleSelected,
              onSetAll: (ids) => setSelected(new Set(ids ?? [])),
            } : undefined}
          />
          {canBulk && selectedIds.length > 0 && (
            <BulkBar
              board={board}
              count={selectedIds.length}
              busy={bulkBusy}
              onAction={onBulkAction}
              onClear={() => setSelected(new Set())}
            />
          )}
        </>
      )}

      {view === "calendar" && (
        <CalendarView board={board} tasks={visible} today={today} onOpen={open} onReschedule={(t, d) => void reschedule(t, d)} />
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
        <span>Tasks help your group plan. They don't change contribution scores.</span>
        <button type="button" onClick={() => setHelp(true)} className={`rounded text-sm text-slate-700 underline ${FOCUS_LIGHT}`}>
          Press <kbd className="rounded border border-slate-300 bg-slate-50 px-1 text-xs font-semibold text-slate-900">?</kbd> for shortcuts
        </button>
      </p>

      {openTask && (
        <TaskDetailsModal
          board={board}
          task={openTask}
          actions={actions}
          orderedIds={orderedIds}
          onNavigate={navigate}
          onClose={() => open(null)}
          restoreFocusTo={openerRef.current}
          onOpenDocument={onOpenDocument}
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

      {help && <ShortcutsDialog canCreate={board.viewer.canCreate} onClose={() => setHelp(false)} />}

      {pending && (
        <BulkConfirmDialog
          question={confirmQuestion(pending.action, pending.ids.length, board)}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const { action, ids } = pending;
            setPending(null);
            void runBulk(action, ids);
          }}
        />
      )}

      {skippedInfo && (
        <BulkSkippedDialog skipped={skippedInfo} onClose={() => setSkippedInfo(null)} />
      )}
    </div>
  );
}

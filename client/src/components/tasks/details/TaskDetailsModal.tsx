import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import {
  TASK_LIMITS, TASK_STATUS_LABELS, type BoardResponse, type BoardTask, type TaskLabelColor, type TaskStatus,
} from "@shared/taskTypes";
import { useTaskDetails } from "../../../hooks/useTaskDetails";
import type { TaskActions } from "../../../hooks/useTaskActions";
import { useFocusTrap } from "../../../lib/useFocusTrap";
import { TaskApiError, type UpdateTaskInput } from "../../../lib/tasks/api";
import { lockReason } from "../../../lib/tasks/permissionText";
import { BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../../ui/styles";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../icons";
import { ActivityTabs } from "./ActivityTabs";
import { AttachmentsSection } from "./AttachmentsSection";
import { AdvancedFields, DetailsSidebar } from "./DetailsSidebar";
import { LinkedCommits } from "./LinkedCommits";
import { MoreDetails, hasMoreContent } from "./MoreDetails";
import { MentionText, MentionTextarea, displayFromStored, storedFromDisplay } from "./MentionTextarea";
import { SubtaskList } from "./SubtaskList";

interface Props {
  board: BoardResponse;
  task: BoardTask;
  actions: TaskActions;
  /** Task ids in the order of the current view and filters, for "N of M" and the previous/next buttons. */
  orderedIds: number[];
  onNavigate: (taskId: number) => void;
  onClose: () => void;
  /** The card, row or chip that opened the window; focus returns to it on close. */
  restoreFocusTo?: HTMLElement | null;
  /** Present when the group has a Document tab: lets the task link to, and open, a heading. */
  onOpenDocument?: (task: BoardTask) => void;
}

const ICON_BUTTON = `inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent ${FOCUS_LIGHT}`;

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/**
 * The task details window: a centered ~980px dialog over a dimmed board (full screen on phones),
 * opened from the board, list, calendar or a ?task= link. Controls the viewer may not use are shown
 * disabled with the reason, mirroring `task.permissions` from the server; nothing is decided here.
 */
export function TaskDetailsModal({ board, task, actions, orderedIds, onNavigate, onClose, restoreFocusTo, onOpenDocument }: Props) {
  const dismissRef = useRef<(() => void) | null>(null);
  const taskIdRef = useRef(task.id);
  taskIdRef.current = task.id;

  const ref = useFocusTrap<HTMLDivElement>(
    () => {
      // Escape closes an open @ list first; only a second press closes the window.
      if (dismissRef.current) { dismissRef.current(); return; }
      onClose();
    },
    () => {
      const current = document.querySelector<HTMLElement>(`[data-task-open="${taskIdRef.current}"]`);
      if (current) current.focus();
      else if (restoreFocusTo?.isConnected) restoreFocusTo.focus();
    },
  );

  const details = useTaskDetails(task.projectId, task.id);
  const d = details.details;
  const viewer = board.viewer;
  const perms = task.permissions;

  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  // Keep the page behind from scrolling while the window is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const index = orderedIds.indexOf(task.id);
  const prevId = index > 0 ? orderedIds[index - 1]! : null;
  const nextId = index >= 0 && index < orderedIds.length - 1 ? orderedIds[index + 1]! : null;

  // J / K step between tasks without closing (the board's own shortcuts stand down while a dialog is open).
  const stepRef = useRef({ prevId, nextId, onNavigate });
  stepRef.current = { prevId, nextId, onNavigate };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(document.activeElement)) return;
      const { prevId: p, nextId: n, onNavigate: go } = stepRef.current;
      if (e.key === "j" || e.key === "J") { if (n !== null) { e.preventDefault(); go(n); } }
      else if (e.key === "k" || e.key === "K") { if (p !== null) { e.preventDefault(); go(p); } }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function save(input: UpdateTaskInput) {
    setError("");
    try {
      const saved = await actions.updateTask(task, input);
      const w = (saved as BoardTask & { warnings?: string[] }).warnings;
      setWarning(w?.[0] ?? "");
      void details.query.refetch(); // History shows the change
    } catch (err) {
      if (!(err instanceof TaskApiError && err.isConflict)) {
        setError(err instanceof Error ? err.message : "Could not save the change.");
      }
    }
  }

  async function changeStatus(status: TaskStatus) {
    setError("");
    await actions.moveToStatus(task, status);
    void details.query.refetch();
  }

  async function addLabel(input: { name: string; color: TaskLabelColor }) {
    setError("");
    try {
      const created = await actions.createLabel(input);
      if (perms.edit) await save({ labelIds: [...task.labelIds, created.id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the label.");
    }
  }

  async function remove() {
    try {
      await actions.deleteTask(task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the task.");
    }
  }

  const commentLock = perms.comment ? null : lockReason("comment", task, viewer);
  const editLock = perms.edit ? null : lockReason("edit", task, viewer);
  const watchLock = perms.watch ? null : lockReason("watch", task, viewer);
  const watching = d?.watching ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/60 sm:items-center sm:p-4" data-testid="task-details-scrim">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-details-key"
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[min(92vh,56rem)] sm:max-w-[980px] sm:rounded-xl"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 id="task-details-key" className="text-lg font-semibold text-slate-900">{task.key}</h2>
            <span className="text-sm text-slate-700">{TASK_STATUS_LABELS[task.status]}{viewer.readOnly ? " · View only" : ""}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {index >= 0 && (
              <span className="mr-1 text-sm tabular-nums text-slate-800" aria-live="polite">{index + 1} of {orderedIds.length}</span>
            )}
            <button
              type="button"
              disabled={prevId === null}
              onClick={() => prevId !== null && onNavigate(prevId)}
              aria-label="Previous task"
              title="Previous task (K)"
              className={ICON_BUTTON}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={nextId === null}
              onClick={() => nextId !== null && onNavigate(nextId)}
              aria-label="Next task"
              title="Next task (J)"
              className={ICON_BUTTON}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <span title={watchLock ?? undefined}>
              <button
                type="button"
                disabled={!perms.watch || !d}
                aria-pressed={watching}
                aria-describedby={watchLock ? "task-watch-lock" : undefined}
                onClick={() => void details.setWatching(!watching)}
                className={`${BUTTON_SECONDARY_COMPACT} ${watching ? "border-indigo-700 bg-indigo-50 text-indigo-900" : ""}`}
              >
                {watching ? "Watching" : "Watch"} <span className="ml-1 tabular-nums">({d?.watchers.length ?? 0})</span>
              </button>
              {watchLock && <span id="task-watch-lock" className="sr-only">{watchLock}</span>}
            </span>
            <button type="button" onClick={onClose} aria-label="Close task details" className={ICON_BUTTON}>
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_20rem]">
          <div key={task.id} className="min-w-0 space-y-5 p-4">
            {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{error}</p>}

            {/* Re-keyed on version so a change made by someone else replaces the fields. */}
            <div key={`${task.id}:${task.version}`} className="space-y-4">
              <div title={editLock ?? undefined}>
                <label htmlFor="task-title" className="mb-1 block text-sm font-medium text-slate-900">Title</label>
                {perms.edit ? (
                  <input
                    id="task-title"
                    defaultValue={task.title}
                    maxLength={TASK_LIMITS.title}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v) { e.target.value = task.title; return; }
                      if (v !== task.title) void save({ title: v });
                    }}
                    className={`min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-base font-semibold text-slate-900 ${FOCUS_LIGHT}`}
                  />
                ) : (
                  <p id="task-title" className="break-words text-base font-semibold text-slate-900">{task.title}</p>
                )}
              </div>

              <div title={editLock ?? undefined}>
                {perms.edit ? (
                  <DescriptionField
                    task={task}
                    board={board}
                    dismissRef={dismissRef}
                    onSave={save}
                    onError={setError}
                  />
                ) : (
                  <>
                    <p className="mb-1 text-sm font-medium text-slate-900">Description</p>
                    {task.description
                      ? <MentionText text={task.description} members={board.members} className="text-sm text-slate-900" />
                      : <p className="text-sm text-slate-700">No description.</p>}
                    {editLock && <p className="mt-1 text-xs text-slate-700">{editLock}</p>}
                  </>
                )}
              </div>
            </div>

            {details.query.isError && !d && (
              <div role="alert" className="text-sm">
                <p className="font-medium text-red-800">Could not load subtasks, comments and history.</p>
                <button type="button" onClick={() => void details.query.refetch()} className={`mt-2 ${BUTTON_SECONDARY_COMPACT}`}>Try again</button>
              </div>
            )}
            {!d && !details.query.isError && <p className="text-sm text-slate-700">Loading…</p>}

            {d && (
              <>
                <MoreDetails
                  open={hasMoreContent(task, d)}
                >
                  <SubtaskList
                    task={task}
                    subtasks={d.subtasks}
                    lockedReason={editLock}
                    onAdd={details.addSubtask}
                    onToggle={details.setSubtaskDone}
                    onRemove={details.removeSubtask}
                    onReorder={details.reorderSubtasks}
                  />
                  <AttachmentsSection
                    task={task}
                    attachments={d.attachments}
                    storage={d.storage}
                    lockedReason={editLock}
                    onUpload={details.uploadAttachment}
                    onRemove={details.removeAttachment}
                  />
                  <LinkedCommits task={task} commits={d.commits} hasRepo={board.group.hasRepo} />
                  <AdvancedFields
                    board={board}
                    task={task}
                    watchers={d.watchers}
                    save={save}
                    addLabel={addLabel}
                    onOpenDocument={onOpenDocument}
                  />
                </MoreDetails>
                <ActivityTabs
                  board={board}
                  task={task}
                  comments={d.comments}
                  activity={d.activity}
                  commentLockedReason={commentLock}
                  onAdd={details.addComment}
                  onEdit={details.editComment}
                  onRemove={details.removeComment}
                  dismissRef={dismissRef}
                />
              </>
            )}
          </div>

          <div key={`side:${task.id}:${task.version}`} className="flex min-w-0 flex-col">
            <DetailsSidebar
              board={board}
              task={task}
              warning={warning}
              save={save}
              changeStatus={changeStatus}
              onDelete={remove}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Description with @mention autocomplete; saves when it loses focus. Re-keyed with the task version. */
function DescriptionField({ task, board, dismissRef, onSave, onError }: {
  task: BoardTask;
  board: BoardResponse;
  dismissRef: MutableRefObject<(() => void) | null>;
  onSave: (input: UpdateTaskInput) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(() => displayFromStored(task.description ?? "", board.members));

  async function commit() {
    const stored = storedFromDisplay(draft, board.members).trim();
    if (stored === (task.description ?? "")) return;
    if (stored.length > TASK_LIMITS.description) { onError(`The description can be up to ${TASK_LIMITS.description} characters.`); return; }
    await onSave({ description: stored || null });
  }

  return (
    <MentionTextarea
      id="task-description"
      label="Description"
      value={draft}
      onChange={setDraft}
      members={board.members}
      rows={4}
      maxLength={TASK_LIMITS.description}
      placeholder="Add a description. Type @ to mention a group member."
      onBlur={() => void commit()}
      dismissRef={dismissRef}
    />
  );
}

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  TASK_LABEL_COLORS, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS,
  type BoardResponse, type BoardTask, type TaskLabelColor, type TaskPriority, type TaskStatus,
} from "@shared/taskTypes";
import { Avatar } from "../../Avatar";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../../ui/styles";
import type { UpdateTaskInput } from "../../../lib/tasks/api";
import { formatDeadline, formatDue, isAfterDeadline } from "../../../lib/tasks/dates";
import { LABEL_CHIP_CLASSES } from "../../../lib/tasks/labels";
import { lockReason } from "../../../lib/tasks/permissionText";
import { AlertTriangleIcon, LockIcon } from "../icons";
import { HeadingPicker } from "./HeadingPicker";
import { SuggestedAssignee } from "./SuggestedAssignee";

const FIELD = `min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700 ${FOCUS_LIGHT}`;

/** A labelled control. When locked, the reason is a tooltip and is read out with the control. */
function Field({ label, htmlFor, locked, children }: { label: string; htmlFor: string; locked?: string | null; children: ReactNode }) {
  return (
    <div title={locked ?? undefined}>
      <label htmlFor={htmlFor} className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-900">
        {label}
        {locked && <LockIcon className="h-3.5 w-3.5 text-slate-700" />}
      </label>
      {children}
      {locked && <span id={`${htmlFor}-lock`} className="sr-only">{locked}</span>}
    </div>
  );
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

interface Props {
  board: BoardResponse;
  task: BoardTask;
  /** Server warning from the last save (e.g. a due date after the deadline). */
  warning: string;
  save: (input: UpdateTaskInput) => Promise<void>;
  changeStatus: (status: TaskStatus) => Promise<void>;
  onDelete: () => Promise<void>;
}

/** The light-gray right column: status, assignee, priority, due date and delete. The rest lives in "More details". */
export function DetailsSidebar({ board, task, warning, save, changeStatus, onDelete }: Props) {
  const perms = task.permissions;
  const viewer = board.viewer;
  const assigneeRef = useRef<HTMLSelectElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const assignee = board.members.find((m) => m.userId === task.assignedToUserId) ?? null;
  const dueLate = isAfterDeadline(task.dueDate, board.group.deadline);
  const deadlineLabel = board.group.deadline ? formatDeadline(board.group.deadline) : "";

  const editLock = perms.edit ? null : lockReason("edit", task, viewer);
  const dueLock = perms.setDue ? null : lockReason("setDue", task, viewer);
  const assignLock = perms.assign ? null : lockReason("assign", task, viewer);
  const moveLock = perms.move ? null : lockReason("move", task, viewer);

  return (
    <aside aria-label="Task fields" className="flex-1 space-y-4 bg-slate-50 p-4 md:border-l md:border-slate-200">
      <Field label="Status" htmlFor="task-status" locked={moveLock}>
        <select
          id="task-status"
          value={task.status}
          disabled={!perms.move}
          aria-describedby={moveLock ? "task-status-lock" : undefined}
          onChange={(e) => void changeStatus(e.target.value as TaskStatus)}
          className={FIELD}
        >
          {TASK_STATUSES.map((s) => {
            const ok = perms.allowedStatuses.includes(s);
            return (
              <option key={s} value={s} disabled={!ok && s !== task.status}>
                {TASK_STATUS_LABELS[s]}{!ok && s === "DONE" ? " (leader only)" : ""}
              </option>
            );
          })}
        </select>
      </Field>

      <div>
        <Field label="Assignee" htmlFor="task-assignee" locked={assignLock}>
          <select
            id="task-assignee"
            ref={assigneeRef}
            value={task.assignedToUserId ?? ""}
            disabled={!perms.assign}
            aria-describedby={assignLock ? "task-assignee-lock" : undefined}
            onChange={(e) => void save({ assignedToUserId: e.target.value ? Number(e.target.value) : null })}
            className={FIELD}
          >
            <option value="">Unassigned</option>
            {board.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
          </select>
        </Field>
        {!perms.assign && assignee && <p className="mt-1 text-xs text-slate-700">Assigned to {assignee.name}</p>}
        {perms.assign && (
          <SuggestedAssignee
            board={board}
            task={task}
            onConfirm={(userId) => void save({ assignedToUserId: userId })}
            onChange={() => assigneeRef.current?.focus()}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" htmlFor="task-priority" locked={editLock}>
          <select
            id="task-priority"
            value={task.priority}
            disabled={!perms.edit}
            aria-describedby={editLock ? "task-priority-lock" : undefined}
            onChange={(e) => void save({ priority: e.target.value as TaskPriority })}
            className={FIELD}
          >
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
          </select>
        </Field>
        <Field label="Due date" htmlFor="task-due" locked={dueLock}>
          <input
            id="task-due"
            type="date"
            defaultValue={task.dueDate ?? ""}
            disabled={!perms.setDue}
            aria-describedby={dueLock ? "task-due-lock" : undefined}
            onChange={(e) => {
              const v = e.target.value;
              if (v !== (task.dueDate ?? "")) void save({ dueDate: v || null });
            }}
            className={FIELD}
          />
        </Field>
      </div>
      {dueLate && deadlineLabel && <Warning>{warning || `This is after the project deadline (${deadlineLabel}).`}</Warning>}

      <div className="border-t border-slate-200 pt-4" title={perms.delete ? undefined : lockReason("delete", task, viewer)}>
        {!confirmDelete ? (
          <>
            <button
              type="button"
              disabled={!perms.delete}
              aria-describedby={perms.delete ? undefined : "task-delete-lock"}
              onClick={() => setConfirmDelete(true)}
              className={`${BUTTON_SECONDARY_COMPACT} border-red-300 text-red-900 disabled:border-slate-300 disabled:text-slate-600`}
            >
              Delete task
            </button>
            {!perms.delete && <p id="task-delete-lock" className="mt-1 text-xs text-slate-700">{lockReason("delete", task, viewer)}</p>}
          </>
        ) : (
          <div role="alertdialog" aria-label="Confirm delete" className="space-y-2">
            <p className="text-sm font-medium text-slate-900">Delete {task.key}? This also removes its subtasks, comments, attachments and history.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void onDelete()}
                className="inline-flex min-h-8 items-center rounded-lg bg-red-800 px-3 text-sm font-semibold text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}


interface AdvancedProps {
  board: BoardResponse;
  task: BoardTask;
  watchers: number[];
  save: (input: UpdateTaskInput) => Promise<void>;
  addLabel: (input: { name: string; color: TaskLabelColor }) => Promise<void>;
  /** Present when the group has a Document tab: lets the task link to, and open, a heading. */
  onOpenDocument?: (task: BoardTask) => void;
}

/** Milestone, labels, linked document heading and watchers: shown under "More details". */
export function AdvancedFields({ board, task, watchers, save, addLabel, onOpenDocument }: AdvancedProps) {
  const perms = task.permissions;
  const viewer = board.viewer;
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState({ name: "", color: "blue" as TaskLabelColor });

  const milestone = board.milestones.find((m) => m.id === task.milestoneId) ?? null;
  const milestoneLate = isAfterDeadline(milestone?.dueDate ?? null, board.group.deadline);
  const deadlineLabel = board.group.deadline ? formatDeadline(board.group.deadline) : "";
  const editLock = perms.edit ? null : lockReason("edit", task, viewer);
  const assignLock = perms.assign ? null : lockReason("assign", task, viewer);
  const watcherPeople = watchers.map((id) => board.members.find((m) => m.userId === id)).filter((m): m is NonNullable<typeof m> => !!m);

  async function submitLabel() {
    const name = newLabel.name.trim();
    if (!name) return;
    await addLabel({ name, color: newLabel.color });
    setNewLabel({ name: "", color: "blue" });
    setAdding(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <Field label="Milestone" htmlFor="task-milestone" locked={assignLock}>
          <select
            id="task-milestone"
            value={task.milestoneId ?? ""}
            disabled={!perms.assign}
            aria-describedby={assignLock ? "task-milestone-lock" : undefined}
            onChange={(e) => void save({ milestoneId: e.target.value ? Number(e.target.value) : null })}
            className={FIELD}
          >
            <option value="">No milestone</option>
            {board.milestones.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.dueDate ? ` (due ${formatDue(m.dueDate)})` : ""}</option>
            ))}
          </select>
        </Field>
        {milestoneLate && deadlineLabel && (
          <div className="mt-2"><Warning>This milestone is due after the project deadline ({deadlineLabel}).</Warning></div>
        )}
      </div>

      <fieldset title={editLock ?? undefined}>
        <legend className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-900">
          Labels {editLock && <LockIcon className="h-3.5 w-3.5 text-slate-700" />}
        </legend>
        {board.labels.length === 0 && <p className="text-sm text-slate-700">No labels in this group yet.</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {board.labels.map((l) => (
            <label key={l.id} className="flex min-h-9 items-center gap-2 text-sm text-slate-900">
              <input
                type="checkbox"
                disabled={!perms.edit}
                checked={task.labelIds.includes(l.id)}
                onChange={() => void save({
                  labelIds: task.labelIds.includes(l.id) ? task.labelIds.filter((x) => x !== l.id) : [...task.labelIds, l.id],
                })}
                className="h-4 w-4"
              />
              <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${LABEL_CHIP_CLASSES[l.color]}`}>{l.name}</span>
            </label>
          ))}
        </div>
        {editLock && <p className="mt-1 text-xs text-slate-700">{editLock}</p>}
        {viewer.isLeader && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={`mt-1 ${BUTTON_SECONDARY_COMPACT}`}>New label</button>
        )}
        {viewer.isLeader && adding && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="new-label-name" className="mb-1 block text-sm font-medium text-slate-900">Label name</label>
              <input
                id="new-label-name"
                value={newLabel.name}
                maxLength={24}
                onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
                className={`${FIELD} w-36`}
              />
            </div>
            <div>
              <label htmlFor="new-label-color" className="mb-1 block text-sm font-medium text-slate-900">Color</label>
              <select
                id="new-label-color"
                value={newLabel.color}
                onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value as TaskLabelColor })}
                className={`${FIELD} w-24`}
              >
                {TASK_LABEL_COLORS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => void submitLabel()} disabled={!newLabel.name.trim()} className={BUTTON_PRIMARY_COMPACT}>Add label</button>
            <button type="button" onClick={() => setAdding(false)} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
          </div>
        )}
      </fieldset>

      {(onOpenDocument || task.docHeading) && (
        <section aria-labelledby="task-doc-heading" title={editLock ?? undefined}>
          <h3 id="task-doc-heading" className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-900">
            Linked document heading {editLock && <LockIcon className="h-3.5 w-3.5 text-slate-700" />}
          </h3>
          {onOpenDocument ? (
            <>
              <HeadingPicker
                projectId={task.projectId}
                id="task-doc-heading-select"
                current={task.docHeading}
                disabled={!perms.edit}
                describedBy={editLock ? "task-doc-heading-lock" : undefined}
                onSelect={(heading) => void save({ docHeading: heading })}
              />
              {editLock && <span id="task-doc-heading-lock" className="sr-only">{editLock}</span>}
              {task.docHeading && (
                <button type="button" onClick={() => onOpenDocument(task)} className={`mt-2 ${BUTTON_SECONDARY_COMPACT}`}>
                  Open in document
                </button>
              )}
            </>
          ) : (
            <p className="break-words text-sm text-slate-900">{task.docHeading}</p>
          )}
        </section>
      )}

      <section aria-labelledby="task-watchers">
        <h3 id="task-watchers" className="mb-1 text-sm font-medium text-slate-900">Watchers ({watcherPeople.length})</h3>
        {watcherPeople.length === 0 ? (
          <p className="text-sm text-slate-700">Nobody is watching this task.</p>
        ) : (
          <ul className="space-y-1">
            {watcherPeople.map((m) => (
              <li key={m.userId} className="flex items-center gap-2 text-sm text-slate-900">
                <Avatar
                  userId={m.userId}
                  name={m.name}
                  avatarUpdatedAt={m.avatarUpdatedAt}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-900"
                />
                {m.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

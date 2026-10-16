import { useState } from "react";
import type { ReactNode } from "react";
import {
  TASK_LABEL_COLORS, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS,
  type BoardResponse, type BoardTask, type TaskLabelColor, type TaskPriority, type TaskStatus,
} from "@shared/taskTypes";
import { Drawer } from "../ui/Drawer";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";
import { TaskApiError, type UpdateTaskInput } from "../../lib/tasks/api";
import { formatDue, todayManila } from "../../lib/tasks/dates";
import { LABEL_CHIP_CLASSES } from "../../lib/tasks/labels";
import type { TaskActions } from "../../hooks/useTaskActions";
import { AlertTriangleIcon } from "./icons";

interface Props {
  board: BoardResponse;
  task: BoardTask;
  actions: TaskActions;
  onClose: () => void;
  restoreFocusTo?: HTMLElement | null;
}

const FIELD = `min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-700 ${FOCUS_LIGHT}`;

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-900">{label}</label>
      {children}
    </div>
  );
}

/**
 * Task details side panel. Fields the viewer cannot change are shown as plain text, so the panel
 * mirrors the server's permissions (`task.permissions`) without ever deciding them itself.
 * (Subtasks, comments, history, attachments and watchers arrive in a later phase.)
 */
export function TaskPanel({ board, task, actions, onClose, restoreFocusTo }: Props) {
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newLabel, setNewLabel] = useState({ name: "", color: "blue" as TaskLabelColor });
  const [addingLabel, setAddingLabel] = useState(false);

  const perms = task.permissions;
  const isLeader = board.viewer.isLeader;
  const assignee = board.members.find((m) => m.userId === task.assignedToUserId) ?? null;
  const milestone = board.milestones.find((m) => m.id === task.milestoneId) ?? null;
  const deadlineDay = board.group.deadline ? todayManila(new Date(board.group.deadline)) : null;
  const deadlineLabel = board.group.deadline
    ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(new Date(board.group.deadline))
    : null;
  const afterDeadline = !!(task.dueDate && deadlineDay && task.dueDate > deadlineDay);

  async function save(input: UpdateTaskInput) {
    setError("");
    try {
      const saved = await actions.updateTask(task, input);
      const w = (saved as BoardTask & { warnings?: string[] }).warnings;
      setWarning(w?.[0] ?? "");
    } catch (err) {
      if (!(err instanceof TaskApiError && err.isConflict)) {
        setError(err instanceof Error ? err.message : "Could not save the change.");
      }
    }
  }

  async function changeStatus(status: TaskStatus) {
    setError("");
    await actions.moveToStatus(task, status);
  }

  async function addLabel() {
    const name = newLabel.name.trim();
    if (!name) return;
    setError("");
    try {
      const created = await actions.createLabel({ name, color: newLabel.color });
      setNewLabel({ name: "", color: "blue" });
      setAddingLabel(false);
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

  return (
    <Drawer
      open
      onClose={onClose}
      title={task.key}
      subtitle={<span>{TASK_STATUS_LABELS[task.status]}{board.viewer.readOnly ? " · View only" : ""}</span>}
      restoreFocusTo={restoreFocusTo}
    >
      {/* Re-keyed on version so a change made by someone else replaces the fields. */}
      <div key={`${task.id}:${task.version}`} className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{error}</p>}

        <Field label="Title" htmlFor="task-title">
          {perms.edit ? (
            <input
              id="task-title"
              defaultValue={task.title}
              maxLength={200}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) { e.target.value = task.title; return; }
                if (v !== task.title) void save({ title: v });
              }}
              className={FIELD}
            />
          ) : (
            <p className="break-words text-sm text-slate-900">{task.title}</p>
          )}
        </Field>

        <Field label="Description" htmlFor="task-description">
          {perms.edit ? (
            <textarea
              id="task-description"
              defaultValue={task.description ?? ""}
              rows={4}
              maxLength={5000}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (task.description ?? "")) void save({ description: v || null });
              }}
              className={`${FIELD} py-2`}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{task.description || "No description."}</p>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="task-status">
            <select
              id="task-status"
              value={task.status}
              disabled={!perms.move}
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

          <Field label="Assignee" htmlFor="task-assignee">
            {perms.assign ? (
              <select
                id="task-assignee"
                value={task.assignedToUserId ?? ""}
                onChange={(e) => void save({ assignedToUserId: e.target.value ? Number(e.target.value) : null })}
                className={FIELD}
              >
                <option value="">Unassigned</option>
                {board.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </select>
            ) : (
              <p className="text-sm text-slate-900">{assignee?.name ?? "Unassigned"}</p>
            )}
          </Field>

          <Field label="Priority" htmlFor="task-priority">
            {perms.edit ? (
              <select
                id="task-priority"
                value={task.priority}
                onChange={(e) => void save({ priority: e.target.value as TaskPriority })}
                className={FIELD}
              >
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
              </select>
            ) : (
              <p className="text-sm text-slate-900">{TASK_PRIORITY_LABELS[task.priority]}</p>
            )}
          </Field>

          <Field label="Due date" htmlFor="task-due">
            {perms.setDue ? (
              <input
                id="task-due"
                type="date"
                defaultValue={task.dueDate ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v !== (task.dueDate ?? "")) void save({ dueDate: v || null });
                }}
                className={FIELD}
              />
            ) : (
              <p className="text-sm text-slate-900">{task.dueDate ? formatDue(task.dueDate) : "No due date"}</p>
            )}
          </Field>
        </div>

        {afterDeadline && deadlineLabel && (
          <p role="status" className="flex items-start gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
            <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {warning || `This is after the project deadline (${deadlineLabel}).`}
          </p>
        )}

        <Field label="Milestone" htmlFor="task-milestone">
          {perms.assign ? (
            <select
              id="task-milestone"
              value={task.milestoneId ?? ""}
              onChange={(e) => void save({ milestoneId: e.target.value ? Number(e.target.value) : null })}
              className={FIELD}
            >
              <option value="">No milestone</option>
              {board.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <p className="text-sm text-slate-900">{milestone?.name ?? "No milestone"}</p>
          )}
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-900">Labels</legend>
          {board.labels.length === 0 && !isLeader && <p className="text-sm text-slate-700">No labels in this group yet.</p>}
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
          {isLeader && !addingLabel && (
            <button type="button" onClick={() => setAddingLabel(true)} className={`mt-1 ${BUTTON_SECONDARY_COMPACT}`}>New label</button>
          )}
          {isLeader && addingLabel && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="new-label-name" className="mb-1 block text-sm font-medium text-slate-900">Label name</label>
                <input
                  id="new-label-name"
                  value={newLabel.name}
                  maxLength={24}
                  onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
                  className={`${FIELD} w-40`}
                />
              </div>
              <div>
                <label htmlFor="new-label-color" className="mb-1 block text-sm font-medium text-slate-900">Color</label>
                <select
                  id="new-label-color"
                  value={newLabel.color}
                  onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value as TaskLabelColor })}
                  className={`${FIELD} w-28`}
                >
                  {TASK_LABEL_COLORS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => void addLabel()} disabled={!newLabel.name.trim()} className={BUTTON_PRIMARY_COMPACT}>Add label</button>
              <button type="button" onClick={() => setAddingLabel(false)} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
            </div>
          )}
        </fieldset>

        {perms.delete && (
          <div className="border-t border-slate-200 pt-4">
            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${BUTTON_SECONDARY_COMPACT} border-red-300 text-red-900`}>
                Delete task
              </button>
            ) : (
              <div role="alertdialog" aria-label="Confirm delete" className="space-y-2">
                <p className="text-sm font-medium text-slate-900">Delete {task.key}? This also removes its history.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void remove()} className="inline-flex min-h-8 items-center rounded-lg bg-red-800 px-3 text-sm font-semibold text-white hover:bg-red-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800">
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

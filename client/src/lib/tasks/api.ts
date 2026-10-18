import type {
  BoardTask, TaskPriority, TaskStatus, BoardLabel, TaskLabelColor, BulkAction, BulkEditResponse,
  TaskAttachmentMeta, TaskCommentView, TaskDetails, TaskSubtask,
} from "@shared/taskTypes";
import type { Placement } from "./placement";

// Thin fetch helpers for the Tasks routes. Every mutation sends the version it last saw;
// a 409 carries the current task so the board can refresh instead of overwriting someone else.

export class TaskApiError extends Error {
  status: number;
  code?: string;
  task?: BoardTask | null;
  constructor(status: number, message: string, code?: string, task?: BoardTask | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.task = task;
  }
  get isConflict(): boolean { return this.status === 409 && this.code === "VERSION_CONFLICT"; }
}

type TaskResult = BoardTask & { warnings?: string[] };

async function call<T>(token: string | null, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; task?: BoardTask | null };
  if (!res.ok) throw new TaskApiError(res.status, json.error ?? "Something went wrong.", json.code, json.task);
  return json;
}

const base = (projectId: number) => `/api/groups/${projectId}`;
const taskBase = (projectId: number, taskId: number) => `${base(projectId)}/tasks/${taskId}`;

/** Upload a raw file body (the server sniffs the real type, so Content-Type is only a hint). */
async function upload(token: string | null, url: string, file: Blob, filename: string): Promise<TaskAttachmentMeta> {
  const res = await fetch(`${url}?filename=${encodeURIComponent(filename)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  const json = (await res.json().catch(() => ({}))) as TaskAttachmentMeta & { error?: string };
  if (!res.ok) throw new TaskApiError(res.status, json.error ?? "Could not upload the file.");
  return json;
}

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assignedToUserId?: number | null;
  milestoneId?: number | null;
  labelIds?: number[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  assignedToUserId?: number | null;
  milestoneId?: number | null;
  labelIds?: number[];
  docHeading?: string | null;
}

export const taskApi = {
  create: (token: string | null, projectId: number, input: CreateTaskInput) =>
    call<TaskResult>(token, "POST", `${base(projectId)}/tasks`, input),

  move: (token: string | null, projectId: number, task: { id: number; version: number }, p: Placement) =>
    call<TaskResult>(token, "POST", `${base(projectId)}/tasks/${task.id}/move`, {
      status: p.status satisfies TaskStatus,
      afterId: p.afterId,
      beforeId: p.beforeId,
      expectedVersion: task.version,
    }),

  update: (token: string | null, projectId: number, task: { id: number; version: number }, input: UpdateTaskInput) =>
    call<TaskResult>(token, "PATCH", `${base(projectId)}/tasks/${task.id}`, { ...input, expectedVersion: task.version }),

  bulk: (token: string | null, projectId: number, taskIds: number[], action: BulkAction) =>
    call<BulkEditResponse>(token, "POST", `${base(projectId)}/tasks/bulk`, { taskIds, action }),

  remove: (token: string | null, projectId: number, taskId: number) =>
    call<{ message: string }>(token, "DELETE", `${base(projectId)}/tasks/${taskId}`),

  createMilestone: (token: string | null, projectId: number, input: { name: string; dueDate?: string | null }) =>
    call<{ id: number; name: string; dueDate: string | null; warnings?: string[] }>(token, "POST", `${base(projectId)}/milestones`, input),

  createLabel: (token: string | null, projectId: number, input: { name: string; color: TaskLabelColor }) =>
    call<BoardLabel>(token, "POST", `${base(projectId)}/labels`, input),

  // ── Task details ──
  details: (token: string | null, projectId: number, taskId: number) =>
    call<TaskDetails>(token, "GET", `${taskBase(projectId, taskId)}/details`),

  addSubtask: (token: string | null, projectId: number, taskId: number, title: string) =>
    call<TaskSubtask>(token, "POST", `${taskBase(projectId, taskId)}/subtasks`, { title }),
  updateSubtask: (token: string | null, projectId: number, taskId: number, id: number, input: { title?: string; done?: boolean }) =>
    call<TaskSubtask>(token, "PATCH", `${taskBase(projectId, taskId)}/subtasks/${id}`, input),
  removeSubtask: (token: string | null, projectId: number, taskId: number, id: number) =>
    call<{ ok: true }>(token, "DELETE", `${taskBase(projectId, taskId)}/subtasks/${id}`),
  reorderSubtasks: (token: string | null, projectId: number, taskId: number, ids: number[]) =>
    call<{ ok: true }>(token, "PUT", `${taskBase(projectId, taskId)}/subtasks/order`, { ids }),

  uploadAttachment: (token: string | null, projectId: number, taskId: number, file: Blob, filename: string) =>
    upload(token, `${taskBase(projectId, taskId)}/attachments`, file, filename),
  removeAttachment: (token: string | null, projectId: number, taskId: number, id: number) =>
    call<{ ok: true }>(token, "DELETE", `${taskBase(projectId, taskId)}/attachments/${id}`),
  attachmentUrl: (projectId: number, taskId: number, id: number) => `${taskBase(projectId, taskId)}/attachments/${id}`,

  addComment: (token: string | null, projectId: number, taskId: number, body: string) =>
    call<TaskCommentView>(token, "POST", `${taskBase(projectId, taskId)}/comments`, { body }),
  editComment: (token: string | null, projectId: number, taskId: number, id: number, body: string) =>
    call<TaskCommentView>(token, "PATCH", `${taskBase(projectId, taskId)}/comments/${id}`, { body }),
  removeComment: (token: string | null, projectId: number, taskId: number, id: number) =>
    call<{ ok: true }>(token, "DELETE", `${taskBase(projectId, taskId)}/comments/${id}`),

  watch: (token: string | null, projectId: number, taskId: number, on: boolean) =>
    call<TaskDetails>(token, on ? "PUT" : "DELETE", `${taskBase(projectId, taskId)}/watch`),

  /** Leader only: read the repo's commit messages and link them to tasks (once per 5 minutes per group). */
  syncCommits: (token: string | null, projectId: number) =>
    call<{ linked: number; matched: number; scanned: number; commitsRefreshedAt: string }>(token, "POST", `${base(projectId)}/tasks/sync-commits`),

  /** Leader only: change the group's task key; the old key keeps linking commits. */
  changeTaskKey: (token: string | null, projectId: number, key: string) =>
    call<{ taskKey: string; keyAliases: string[] }>(token, "PATCH", `${base(projectId)}/task-key`, { key }),

  /** H1/H2 headings of the group's document, read from the saved copy on the server (read-only). */
  documentHeadings: (token: string | null, projectId: number) =>
    call<{ headings: { level: 1 | 2; text: string }[] }>(token, "GET", `${base(projectId)}/document/headings`),
};

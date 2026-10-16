import type {
  BoardTask, TaskPriority, TaskStatus, BoardLabel, TaskLabelColor, BulkAction, BulkEditResponse,
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
};

// Types and constants for the group Tasks board (API contract between server and client).
// Planning data only: nothing in here is read by scoring.ts / documentScoring.ts / combinedScoring.ts,
// and tasks never change a contribution score, flag, Gini value or the AI narrative input.

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

// Fixed palette so a label's meaning never depends on color alone (the name is always shown).
export const TASK_LABEL_COLORS = ["gray", "blue", "green", "amber", "red", "violet", "teal", "pink"] as const;
export type TaskLabelColor = (typeof TASK_LABEL_COLORS)[number];

export const TASK_LIMITS = {
  title: 200,
  description: 5000,
  tasksPerGroup: 500,
  labelsPerTask: 5,
  labelsPerGroup: 20,
  milestonesPerGroup: 30,
  milestoneName: 60,
  labelName: 24,
  bulkTasks: 100,
} as const;

export interface TaskPermissions {
  /** Title, description, priority, labels, linked heading. */
  edit: boolean;
  /** Due date. */
  setDue: boolean;
  /** Assignee and milestone (leader only). */
  assign: boolean;
  delete: boolean;
  /** The viewer may move this task at all (a grip is shown only when true). */
  move: boolean;
  /** Columns this viewer may drop this task into (includes the current column for reordering). */
  allowedStatuses: TaskStatus[];
}

export interface BoardTask {
  id: number;
  projectId: number;
  /** "FT-12": the group's current key plus the task number. */
  key: string;
  number: number;
  title: string;
  description: string | null;
  assignedToUserId: number | null;
  createdByUserId: number;
  /** Legacy flag, always status === "DONE". */
  done: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Calendar date "YYYY-MM-DD" or null. */
  dueDate: string | null;
  position: number;
  version: number;
  milestoneId: number | null;
  docHeading: string | null;
  labelIds: number[];
  subtasks: { done: number; total: number };
  commitCount: number;
  permissions: TaskPermissions;
}

export interface BoardMilestone {
  id: number;
  name: string;
  dueDate: string | null;
  position: number;
  total: number;
  done: number;
}

export interface BoardLabel {
  id: number;
  name: string;
  color: TaskLabelColor;
}

export interface BoardMember {
  userId: number;
  name: string;
  avatarUpdatedAt: string | null;
  role: "LEADER" | "MEMBER";
  functionalRoles: string[];
}

/** A task a bulk edit left unchanged, and why. */
export interface BulkSkipped {
  taskId: number;
  key: string;
  reason: string;
}

export interface BulkEditResponse {
  tasks: BoardTask[];
  skipped: BulkSkipped[];
}

export type BulkAction =
  | { type: "status"; status: TaskStatus }
  | { type: "assign"; userId: number | null }
  | { type: "priority"; priority: TaskPriority }
  | { type: "labels"; add?: number[]; remove?: number[] }
  | { type: "milestone"; milestoneId: number | null };

export interface BoardResponse {
  group: {
    id: number;
    groupName: string;
    /** Current task key, e.g. "FT". */
    taskKey: string;
    /** The assignment (project) deadline, ISO, or null. */
    deadline: string | null;
  };
  viewer: {
    userId: number;
    isLeader: boolean;
    isMember: boolean;
    /** Instructors and admins: view only. */
    readOnly: boolean;
    canCreate: boolean;
    canManageBoard: boolean;
  };
  members: BoardMember[];
  tasks: BoardTask[];
  milestones: BoardMilestone[];
  labels: BoardLabel[];
}

export type TaskActivityType =
  | "created"
  | "status_changed"
  | "assigned"
  | "unassigned"
  | "title_changed"
  | "description_changed"
  | "priority_changed"
  | "due_changed"
  | "milestone_changed"
  | "labels_changed"
  | "doc_heading_changed";

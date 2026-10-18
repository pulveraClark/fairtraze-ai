import type { BoardResponse, BoardTask, TaskPermissions, TaskStatus } from "@shared/taskTypes";

// Builders for Tasks board tests. The permissions on each task are set explicitly (the server
// computes them in real life), so a test states exactly what the viewer is allowed to do.

const ALL: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

export const LEADER_PERMS: TaskPermissions = { edit: true, setDue: true, assign: true, delete: true, move: true, comment: true, watch: true, allowedStatuses: ALL };
export const ASSIGNEE_PERMS: TaskPermissions = { edit: true, setDue: true, assign: false, delete: false, move: true, comment: true, watch: true, allowedStatuses: ["TODO", "IN_PROGRESS", "IN_REVIEW"] };
export const NO_PERMS: TaskPermissions = { edit: false, setDue: false, assign: false, delete: false, move: false, comment: false, watch: false, allowedStatuses: [] };

let nextId = 1;
export function resetFixtureIds() { nextId = 1; }

export function mkTask(over: Partial<BoardTask> = {}): BoardTask {
  const id = over.id ?? nextId++;
  return {
    id,
    projectId: 7,
    key: `FT-${over.number ?? id}`,
    number: id,
    title: `Task ${id}`,
    description: null,
    assignedToUserId: null,
    createdByUserId: 1,
    done: (over.status ?? "TODO") === "DONE",
    completedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: null,
    position: id * 1024,
    version: 1,
    milestoneId: null,
    docHeading: null,
    labelIds: [],
    subtasks: { done: 0, total: 0 },
    commitCount: 0,
    permissions: LEADER_PERMS,
    ...over,
  };
}

export const LEADER = { userId: 1, name: "Leader Lee", avatarUpdatedAt: null, role: "LEADER" as const, functionalRoles: ["DEVELOPER"] };
export const BEN = { userId: 2, name: "Ben Cruz", avatarUpdatedAt: null, role: "MEMBER" as const, functionalRoles: ["DEVELOPER"] };
export const ANA = { userId: 3, name: "Ana Reyes", avatarUpdatedAt: null, role: "MEMBER" as const, functionalRoles: ["DOCUMENTATION"] };

export function mkBoard(over: Partial<BoardResponse> = {}, tasks: BoardTask[] = []): BoardResponse {
  return {
    group: { id: 7, groupName: "Group Alpha", taskKey: "FT", deadline: null },
    viewer: { userId: 1, isLeader: true, isMember: true, readOnly: false, canCreate: true, canManageBoard: true },
    members: [LEADER, BEN, ANA],
    tasks,
    milestones: [],
    labels: [],
    ...over,
  };
}

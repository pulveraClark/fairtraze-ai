import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import {
  TASK_LABEL_COLORS, TASK_LIMITS, TASK_PRIORITIES, TASK_STATUSES,
  type TaskActivityType, type TaskStatus,
} from "@shared/taskTypes.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, type LoadedGroup } from "../lib/groupAccess.js";
import { notify } from "../lib/notify.js";
import {
  canAssignTask, canCreateTask, canDeleteTask, canEditTask, canMoveTask, canSetDueDate,
  canViewBoard, resolveTaskActor, type TaskActor,
} from "../lib/taskPermissions.js";
import {
  afterDeadlineWarning, formatDateOnly, loadBoard, loadTaskRow, logActivity, nextBottomPosition,
  parseDateOnly, serializeTask, statusFields, type TaskRow,
} from "../lib/taskBoard.js";
import { computePosition, rebalanced } from "../lib/taskPosition.js";
import { deriveTaskKey } from "../lib/taskKey.js";

// The group Tasks board. Planning data only: nothing here is read by scoring, the analysis or the
// AI narrative, and tasks never change a contribution score, flag, Gini value or team health.
// Authorization lives in lib/taskPermissions.ts (one helper, mirrored to the client per task).
// Only members, admins (view) and the instructor who OWNS the class can open a group's board; a
// group with no assignment has no owning instructor, so other instructors get 403 (this
// deliberately does not inherit the assignment-less-group gap documented in projects.ts).

export const tasksRouter = Router();

const idParam = z.coerce.number().int().positive();
const dateOnly = z.string().refine((v) => parseDateOnly(v) !== null, "Use a valid date (YYYY-MM-DD).");

const VIEW_ONLY = "Instructors and admins have view-only access to tasks.";

class VersionConflict extends Error {}
class BadRequest extends Error {
  constructor(message: string) { super(message); }
}

interface Ctx { project: LoadedGroup; actor: TaskActor; groupId: number }

/** Parses :id, loads the group and checks the caller may see it. Sends the error response itself. */
async function openGroup(req: Request, res: Response, opts: { write?: boolean } = {}): Promise<Ctx | null> {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid group id" }); return null; }
  const project = await loadGroup(id.data);
  if (!project) { res.status(404).json({ error: "Group not found." }); return null; }
  const actor = resolveTaskActor(req.user!, project);
  if (!canViewBoard(actor)) { res.status(403).json({ error: "You do not have access to this group." }); return null; }
  if (opts.write && !actor.isMember) { res.status(403).json({ error: VIEW_ONLY }); return null; }
  return { project, actor, groupId: id.data };
}

function leaderOnly(res: Response, actor: TaskActor, message: string): boolean {
  if (actor.isLeader) return true;
  res.status(403).json({ error: actor.isMember ? message : VIEW_ONLY });
  return false;
}

async function openTask(req: Request, res: Response, ctx: Ctx): Promise<TaskRow | null> {
  const taskId = idParam.safeParse(req.params.taskId);
  if (!taskId.success) { res.status(400).json({ error: "Invalid task id" }); return null; }
  const task = await loadTaskRow(taskId.data);
  if (!task || task.projectId !== ctx.groupId) { res.status(404).json({ error: "Task not found." }); return null; }
  return task;
}

function taskLink(projectId: number, taskId: number): string {
  return `/student/group/${projectId}?tab=tasks&task=${taskId}`;
}

async function notifyAssigned(project: LoadedGroup, actorId: number, assignments: { taskId: number; title: string; userId: number }[]) {
  const byUser = new Map<number, { taskId: number; title: string }[]>();
  for (const a of assignments) byUser.set(a.userId, [...(byUser.get(a.userId) ?? []), a]);
  for (const [userId, list] of byUser) {
    const one = list[0]!;
    await notify({
      recipientIds: userId,
      actorId,
      type: "TASK_ASSIGNED",
      message: list.length === 1 ? `You were assigned a task: ${one.title}` : `You were assigned ${list.length} tasks`,
      link: list.length === 1 ? taskLink(project.id, one.taskId) : `/student/group/${project.id}?tab=tasks`,
      projectId: project.id,
      refType: "TASK",
      refId: one.taskId,
    });
  }
}

function conflictBody(project: LoadedGroup, actor: TaskActor, current: TaskRow | null) {
  return {
    error: "This task was changed by someone else. The latest version has been loaded.",
    code: "VERSION_CONFLICT",
    task: current ? serializeTask(current, { project, actor }) : null,
  };
}

function withWarnings<T extends object>(body: T, warnings: (string | null)[]): T & { warnings?: string[] } {
  const list = warnings.filter((w): w is string => !!w);
  return list.length ? { ...body, warnings: list } : body;
}

function isMemberOf(project: LoadedGroup, userId: number): boolean {
  return project.groupMemberships.some((m) => m.userId === userId);
}

async function checkLabelIds(projectId: number, labelIds: number[]): Promise<boolean> {
  if (labelIds.length === 0) return true;
  const found = await prisma.taskLabel.count({ where: { projectId, id: { in: labelIds } } });
  return found === new Set(labelIds).size;
}

async function checkMilestoneId(projectId: number, milestoneId: number): Promise<boolean> {
  return (await prisma.taskMilestone.count({ where: { id: milestoneId, projectId } })) === 1;
}

// ── Board ─────────────────────────────────────────────────────────────────────

// GET /api/groups/:id/tasks — the whole board in one payload. Express adds a weak ETag to the JSON
// body, so a poll when nothing changed is a 304 with no body. The body holds no clock values.
tasksRouter.get("/api/groups/:id/tasks", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res);
  if (!ctx) return;
  const board = await loadBoard(ctx.project, ctx.actor);
  res.set("Cache-Control", "private, no-cache");
  res.vary("Authorization");
  res.json(board);
});

// ── Create ────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  title: z.string().trim().min(1).max(TASK_LIMITS.title),
  description: z.string().trim().max(TASK_LIMITS.description).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dateOnly.nullable().optional(),
  // Leader only:
  assignedToUserId: idParam.nullable().optional(),
  milestoneId: idParam.nullable().optional(),
  labelIds: z.array(idParam).max(TASK_LIMITS.labelsPerTask).optional(),
});

// POST /api/groups/:id/tasks — any group member may create a task; a non-leader's task is always
// unassigned and in To do. (Per-user burst limit: taskWriteLimiter, wired in app.ts.)
tasksRouter.post("/api/groups/:id/tasks", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const { project, actor } = ctx;

  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: `A title is required (max ${TASK_LIMITS.title} characters).` });
    return;
  }
  const data = body.data;

  if (!canCreateTask(actor)) { res.status(403).json({ error: VIEW_ONLY }); return; }
  const leaderFields = data.assignedToUserId != null || data.milestoneId != null || (data.labelIds?.length ?? 0) > 0;
  if (!actor.isLeader && leaderFields) {
    res.status(403).json({ error: "Only the group leader can assign a task or set its milestone and labels." });
    return;
  }
  if (data.assignedToUserId != null && !isMemberOf(project, data.assignedToUserId)) {
    res.status(400).json({ error: "assignedToUserId must be a member of this group." });
    return;
  }
  if (data.milestoneId != null && !(await checkMilestoneId(project.id, data.milestoneId))) {
    res.status(400).json({ error: "That milestone does not belong to this group." });
    return;
  }
  if (data.labelIds && !(await checkLabelIds(project.id, data.labelIds))) {
    res.status(400).json({ error: "One of those labels does not belong to this group." });
    return;
  }
  if ((await prisma.task.count({ where: { projectId: project.id } })) >= TASK_LIMITS.tasksPerGroup) {
    res.status(400).json({ error: `A group can have at most ${TASK_LIMITS.tasksPerGroup} tasks.` });
    return;
  }

  const dueDate = data.dueDate ? parseDateOnly(data.dueDate) : null;
  const labelIds = [...new Set(data.labelIds ?? [])];

  const created = await prisma.$transaction(async (tx) => {
    const counter = await tx.project.update({
      where: { id: project.id },
      data: {
        nextTaskNumber: { increment: 1 },
        ...(project.taskKey == null ? { taskKey: deriveTaskKey(project.groupName) } : {}),
      },
      select: { nextTaskNumber: true },
    });
    const task = await tx.task.create({
      data: {
        projectId: project.id,
        number: counter.nextTaskNumber - 1,
        title: data.title,
        description: data.description || null,
        priority: data.priority ?? "MEDIUM",
        dueDate,
        position: await nextBottomPosition(tx, project.id, "TODO"),
        assignedToUserId: actor.isLeader ? data.assignedToUserId ?? null : null,
        milestoneId: actor.isLeader ? data.milestoneId ?? null : null,
        createdByUserId: actor.userId,
        ...statusFields("TODO"),
        labelLinks: { create: labelIds.map((labelId) => ({ labelId })) },
      },
      include: { labelLinks: true },
    });
    await logActivity(tx, [
      { taskId: task.id, actorId: actor.userId, type: "created" },
      ...(task.assignedToUserId != null
        ? [{ taskId: task.id, actorId: actor.userId, type: "assigned" as const, data: { to: task.assignedToUserId } }]
        : []),
    ]);
    return task;
  });

  if (created.assignedToUserId != null) {
    await notifyAssigned(project, actor.userId, [{ taskId: created.id, title: created.title, userId: created.assignedToUserId }]);
  }

  res.status(201).json(withWarnings(
    serializeTask(created, { project, actor }),
    [afterDeadlineWarning(dueDate, project.assignment?.deadline)],
  ));
});

// ── Update (PATCH; PUT is a temporary alias for old tabs during deploy) ──────

const updateSchema = z.object({
  title: z.string().trim().min(1).max(TASK_LIMITS.title).optional(),
  description: z.string().trim().max(TASK_LIMITS.description).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueDate: dateOnly.nullable().optional(),
  assignedToUserId: idParam.nullable().optional(),
  milestoneId: idParam.nullable().optional(),
  labelIds: z.array(idParam).max(TASK_LIMITS.labelsPerTask).optional(),
  docHeading: z.string().trim().min(1).max(200).nullable().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

async function handleUpdate(req: Request, res: Response, opts: { versionRequired: boolean }) {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  const { project, actor } = ctx;

  const body = updateSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid task update." }); return; }
  const input = body.data;
  if (opts.versionRequired && input.expectedVersion === undefined) {
    res.status(400).json({ error: "expectedVersion is required." });
    return;
  }

  // Only fields whose value actually differs count as changes (the UI may send the whole form).
  const nextDescription = input.description === undefined ? undefined : input.description || null;
  const nextDue = input.dueDate === undefined ? undefined : input.dueDate ? parseDateOnly(input.dueDate) : null;
  const currentLabelIds = task.labelLinks.map((l) => l.labelId).sort((a, b) => a - b);
  const nextLabelIds = input.labelIds === undefined ? undefined : [...new Set(input.labelIds)].sort((a, b) => a - b);

  const editChanged =
    (input.title !== undefined && input.title !== task.title) ||
    (nextDescription !== undefined && nextDescription !== task.description) ||
    (input.priority !== undefined && input.priority !== task.priority) ||
    (input.docHeading !== undefined && input.docHeading !== task.docHeading) ||
    (nextLabelIds !== undefined && nextLabelIds.join() !== currentLabelIds.join());
  const dueChanged = nextDue !== undefined && formatDateOnly(nextDue) !== formatDateOnly(task.dueDate);
  const assignChanged = input.assignedToUserId !== undefined && input.assignedToUserId !== task.assignedToUserId;
  const milestoneChanged = input.milestoneId !== undefined && input.milestoneId !== task.milestoneId;

  if (editChanged && !canEditTask(actor, task)) {
    res.status(403).json({ error: "Only the assigned member or the group leader can edit this task (and only until it is Done)." });
    return;
  }
  if (dueChanged && !canSetDueDate(actor, task)) {
    res.status(403).json({ error: "Only the assigned member or the group leader can change this task's due date." });
    return;
  }
  if ((assignChanged || milestoneChanged) && !canAssignTask(actor)) {
    res.status(403).json({ error: "Only the group leader can assign a task or set its milestone." });
    return;
  }
  if (assignChanged && input.assignedToUserId != null && !isMemberOf(project, input.assignedToUserId)) {
    res.status(400).json({ error: "assignedToUserId must be a member of this group." });
    return;
  }
  if (milestoneChanged && input.milestoneId != null && !(await checkMilestoneId(project.id, input.milestoneId))) {
    res.status(400).json({ error: "That milestone does not belong to this group." });
    return;
  }
  if (nextLabelIds && !(await checkLabelIds(project.id, nextLabelIds))) {
    res.status(400).json({ error: "One of those labels does not belong to this group." });
    return;
  }

  if (!editChanged && !dueChanged && !assignChanged && !milestoneChanged) {
    if (input.expectedVersion !== undefined && input.expectedVersion !== task.version) {
      res.status(409).json(conflictBody(project, actor, task));
      return;
    }
    res.json(serializeTask(task, { project, actor }));
    return;
  }

  const expected = input.expectedVersion ?? task.version;
  const data: Prisma.TaskUncheckedUpdateManyInput = { version: { increment: 1 } };
  const activity: { type: TaskActivityType; data?: Prisma.InputJsonValue }[] = [];
  if (input.title !== undefined && input.title !== task.title) {
    data.title = input.title; activity.push({ type: "title_changed" });
  }
  if (nextDescription !== undefined && nextDescription !== task.description) {
    data.description = nextDescription; activity.push({ type: "description_changed" });
  }
  if (input.priority !== undefined && input.priority !== task.priority) {
    data.priority = input.priority; activity.push({ type: "priority_changed", data: { from: task.priority, to: input.priority } });
  }
  if (input.docHeading !== undefined && input.docHeading !== task.docHeading) {
    data.docHeading = input.docHeading; activity.push({ type: "doc_heading_changed" });
  }
  if (dueChanged) {
    data.dueDate = nextDue ?? null;
    activity.push({ type: "due_changed", data: { from: formatDateOnly(task.dueDate), to: formatDateOnly(nextDue ?? null) } });
  }
  if (assignChanged) {
    data.assignedToUserId = input.assignedToUserId ?? null;
    activity.push(input.assignedToUserId != null
      ? { type: "assigned", data: { from: task.assignedToUserId, to: input.assignedToUserId } }
      : { type: "unassigned", data: { from: task.assignedToUserId } });
  }
  if (milestoneChanged) {
    data.milestoneId = input.milestoneId ?? null;
    activity.push({ type: "milestone_changed", data: { from: task.milestoneId, to: input.milestoneId ?? null } });
  }
  const labelsChanged = nextLabelIds !== undefined && nextLabelIds.join() !== currentLabelIds.join();
  if (labelsChanged) activity.push({ type: "labels_changed", data: { from: currentLabelIds, to: nextLabelIds! } });

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.task.updateMany({ where: { id: task.id, version: expected }, data });
      if (result.count === 0) throw new VersionConflict();
      if (labelsChanged) {
        await tx.taskLabelLink.deleteMany({ where: { taskId: task.id } });
        await tx.taskLabelLink.createMany({ data: nextLabelIds!.map((labelId) => ({ taskId: task.id, labelId })) });
      }
      await logActivity(tx, activity.map((a) => ({ taskId: task.id, actorId: actor.userId, ...a })));
    });
  } catch (err) {
    if (err instanceof VersionConflict) {
      res.status(409).json(conflictBody(project, actor, await loadTaskRow(task.id)));
      return;
    }
    throw err;
  }

  const updated = (await loadTaskRow(task.id))!;
  if (assignChanged && updated.assignedToUserId != null) {
    await notifyAssigned(project, actor.userId, [{ taskId: updated.id, title: updated.title, userId: updated.assignedToUserId }]);
  }
  res.json(withWarnings(
    serializeTask(updated, { project, actor }),
    [dueChanged ? afterDeadlineWarning(nextDue ?? null, project.assignment?.deadline) : null],
  ));
}

// ── Move (status and/or order) ────────────────────────────────────────────────

const moveSchema = z.object({
  status: z.enum(TASK_STATUSES),
  afterId: idParam.nullable().optional(),
  beforeId: idParam.nullable().optional(),
  expectedVersion: z.number().int().positive(),
});

async function moveInTransaction(
  tx: Prisma.TransactionClient,
  task: TaskRow,
  actorId: number,
  to: TaskStatus,
  placement: { afterId?: number | null; beforeId?: number | null },
  expectedVersion: number,
) {
  const column = await tx.task.findMany({
    where: { projectId: task.projectId, status: to, NOT: { id: task.id } },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });
  let placed = computePosition(column, placement);
  if (!placed) throw new BadRequest("That position is not in the target column.");
  if (placed.needsRebalance) {
    const fresh = rebalanced(column);
    for (const c of fresh) await tx.task.update({ where: { id: c.id }, data: { position: c.position } });
    placed = computePosition(fresh, placement)!;
  }
  const result = await tx.task.updateMany({
    where: { id: task.id, version: expectedVersion },
    data: { ...statusFields(to, task), position: placed.position, version: { increment: 1 } },
  });
  if (result.count === 0) throw new VersionConflict();
  if (to !== task.status) {
    await logActivity(tx, [{ taskId: task.id, actorId, type: "status_changed", data: { from: task.status, to } }]);
  }
}

// POST /api/groups/:id/tasks/:taskId/move
tasksRouter.post("/api/groups/:id/tasks/:taskId/move", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  const { project, actor } = ctx;

  const body = moveSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "status and expectedVersion are required." }); return; }
  const { status, afterId, beforeId, expectedVersion } = body.data;

  const decision = canMoveTask(actor, task, status);
  if (!decision.ok) { res.status(403).json({ error: decision.message }); return; }

  try {
    await prisma.$transaction((tx) => moveInTransaction(tx, task, actor.userId, status, { afterId, beforeId }, expectedVersion));
  } catch (err) {
    if (err instanceof VersionConflict) {
      res.status(409).json(conflictBody(project, actor, await loadTaskRow(task.id)));
      return;
    }
    if (err instanceof BadRequest) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }
  res.json(serializeTask((await loadTaskRow(task.id))!, { project, actor }));
});

// ── Legacy completion toggle (temporary alias; removed in the final cleanup) ─
// PATCH {done:boolean} from old tabs: same rules as the board. An assignee can no longer mark a
// task Done (leader only); done:false moves a Done task back to To do (leader only).

async function handleLegacyDone(req: Request, res: Response, done: boolean) {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  const { project, actor } = ctx;
  const to: TaskStatus = done ? "DONE" : task.status === "DONE" ? "TODO" : task.status;

  if (to === task.status) { res.json(serializeTask(task, { project, actor })); return; }
  const decision = canMoveTask(actor, task, to);
  if (!decision.ok) { res.status(403).json({ error: decision.message }); return; }
  try {
    await prisma.$transaction((tx) => moveInTransaction(tx, task, actor.userId, to, {}, task.version));
  } catch (err) {
    if (err instanceof VersionConflict) {
      res.status(409).json(conflictBody(project, actor, await loadTaskRow(task.id)));
      return;
    }
    throw err;
  }
  res.json(serializeTask((await loadTaskRow(task.id))!, { project, actor }));
}

tasksRouter.patch("/api/groups/:id/tasks/:taskId", requireAuth, async (req: Request, res: Response) => {
  const keys = Object.keys(req.body ?? {});
  if (keys.length === 1 && keys[0] === "done") {
    const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "done must be a boolean" }); return; }
    await handleLegacyDone(req, res, parsed.data.done);
    return;
  }
  await handleUpdate(req, res, { versionRequired: true });
});

tasksRouter.put("/api/groups/:id/tasks/:taskId", requireAuth, (req: Request, res: Response) =>
  handleUpdate(req, res, { versionRequired: false }));

// ── Delete ────────────────────────────────────────────────────────────────────

tasksRouter.delete("/api/groups/:id/tasks/:taskId", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const task = await openTask(req, res, ctx);
  if (!task) return;
  if (!canDeleteTask(ctx.actor)) {
    res.status(403).json({ error: "Only the group leader can delete tasks." });
    return;
  }
  await prisma.task.delete({ where: { id: task.id } });
  res.json({ message: "Task deleted." });
});

// ── Bulk edit (leader only) ───────────────────────────────────────────────────

const bulkSchema = z.object({
  taskIds: z.array(idParam).min(1).max(TASK_LIMITS.bulkTasks),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("status"), status: z.enum(TASK_STATUSES) }),
    z.object({ type: z.literal("assign"), userId: idParam.nullable() }),
    z.object({ type: z.literal("priority"), priority: z.enum(TASK_PRIORITIES) }),
    z.object({
      type: z.literal("labels"),
      add: z.array(idParam).max(TASK_LIMITS.labelsPerTask).optional(),
      remove: z.array(idParam).max(TASK_LIMITS.labelsPerTask).optional(),
    }),
    z.object({ type: z.literal("milestone"), milestoneId: idParam.nullable() }),
  ]),
});

tasksRouter.post("/api/groups/:id/tasks/bulk", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  const { project, actor } = ctx;
  if (!leaderOnly(res, actor, "Only the group leader can edit several tasks at once.")) return;

  const body = bulkSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid bulk edit." }); return; }
  const taskIds = [...new Set(body.data.taskIds)];
  const action = body.data.action;

  const rows = await prisma.task.findMany({ where: { id: { in: taskIds }, projectId: project.id }, include: { labelLinks: true } });
  if (rows.length !== taskIds.length) { res.status(404).json({ error: "One of those tasks was not found in this group." }); return; }

  if (action.type === "assign" && action.userId != null && !isMemberOf(project, action.userId)) {
    res.status(400).json({ error: "That person is not a member of this group." });
    return;
  }
  if (action.type === "milestone" && action.milestoneId != null && !(await checkMilestoneId(project.id, action.milestoneId))) {
    res.status(400).json({ error: "That milestone does not belong to this group." });
    return;
  }
  if (action.type === "labels" && !(await checkLabelIds(project.id, [...(action.add ?? []), ...(action.remove ?? [])]))) {
    res.status(400).json({ error: "One of those labels does not belong to this group." });
    return;
  }

  const newlyAssigned: { taskId: number; title: string; userId: number }[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      // Process in the order the caller listed them so a column keeps that order.
      for (const id of taskIds) {
        const task = rows.find((r) => r.id === id)!;
        const bump = { version: { increment: 1 } };
        switch (action.type) {
          case "status": {
            if (task.status === action.status) break;
            const position = await nextBottomPosition(tx, project.id, action.status);
            await tx.task.update({ where: { id }, data: { ...statusFields(action.status, task), position, ...bump } });
            await logActivity(tx, [{ taskId: id, actorId: actor.userId, type: "status_changed", data: { from: task.status, to: action.status } }]);
            break;
          }
          case "assign": {
            if (task.assignedToUserId === action.userId) break;
            await tx.task.update({ where: { id }, data: { assignedToUserId: action.userId, ...bump } });
            await logActivity(tx, [action.userId != null
              ? { taskId: id, actorId: actor.userId, type: "assigned", data: { from: task.assignedToUserId, to: action.userId } }
              : { taskId: id, actorId: actor.userId, type: "unassigned", data: { from: task.assignedToUserId } }]);
            if (action.userId != null) newlyAssigned.push({ taskId: id, title: task.title, userId: action.userId });
            break;
          }
          case "priority": {
            if (task.priority === action.priority) break;
            await tx.task.update({ where: { id }, data: { priority: action.priority, ...bump } });
            await logActivity(tx, [{ taskId: id, actorId: actor.userId, type: "priority_changed", data: { from: task.priority, to: action.priority } }]);
            break;
          }
          case "milestone": {
            if (task.milestoneId === action.milestoneId) break;
            await tx.task.update({ where: { id }, data: { milestoneId: action.milestoneId, ...bump } });
            await logActivity(tx, [{ taskId: id, actorId: actor.userId, type: "milestone_changed", data: { from: task.milestoneId, to: action.milestoneId } }]);
            break;
          }
          case "labels": {
            const before = task.labelLinks.map((l) => l.labelId);
            const remove = new Set(action.remove ?? []);
            const after = [...new Set([...before.filter((l) => !remove.has(l)), ...(action.add ?? [])])].sort((a, b) => a - b);
            if (after.length > TASK_LIMITS.labelsPerTask) {
              throw new BadRequest(`A task can have at most ${TASK_LIMITS.labelsPerTask} labels.`);
            }
            if ([...before].sort((a, b) => a - b).join() === after.join()) break;
            await tx.taskLabelLink.deleteMany({ where: { taskId: id } });
            await tx.taskLabelLink.createMany({ data: after.map((labelId) => ({ taskId: id, labelId })) });
            await tx.task.update({ where: { id }, data: bump });
            await logActivity(tx, [{ taskId: id, actorId: actor.userId, type: "labels_changed", data: { from: before, to: after } }]);
            break;
          }
        }
      }
    });
  } catch (err) {
    if (err instanceof BadRequest) { res.status(400).json({ error: err.message }); return; }
    throw err;
  }

  if (newlyAssigned.length) await notifyAssigned(project, actor.userId, newlyAssigned);
  const updated = await prisma.task.findMany({ where: { id: { in: taskIds } }, include: { labelLinks: true } });
  res.json({ tasks: updated.map((t) => serializeTask(t, { project, actor })) });
});

// ── Milestones (leader only) ──────────────────────────────────────────────────

const milestoneSchema = z.object({
  name: z.string().trim().min(1).max(TASK_LIMITS.milestoneName),
  dueDate: dateOnly.nullable().optional(),
});

function serializeMilestone(m: { id: number; name: string; dueDate: Date | null; position: number }, project: LoadedGroup) {
  const base = { id: m.id, name: m.name, dueDate: formatDateOnly(m.dueDate), position: m.position };
  const warning = afterDeadlineWarning(m.dueDate, project.assignment?.deadline);
  return warning ? { ...base, warnings: [warning.replace("This is", "This milestone is")] } : base;
}

tasksRouter.post("/api/groups/:id/milestones", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can manage milestones.")) return;
  const body = milestoneSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: `A milestone needs a name (max ${TASK_LIMITS.milestoneName} characters) and a valid date.` }); return; }
  if ((await prisma.taskMilestone.count({ where: { projectId: ctx.groupId } })) >= TASK_LIMITS.milestonesPerGroup) {
    res.status(400).json({ error: `A group can have at most ${TASK_LIMITS.milestonesPerGroup} milestones.` });
    return;
  }
  const last = await prisma.taskMilestone.findFirst({ where: { projectId: ctx.groupId }, orderBy: { position: "desc" }, select: { position: true } });
  const created = await prisma.taskMilestone.create({
    data: {
      projectId: ctx.groupId,
      name: body.data.name,
      dueDate: body.data.dueDate ? parseDateOnly(body.data.dueDate) : null,
      position: last ? last.position + 1024 : 1024,
    },
  });
  res.status(201).json(serializeMilestone(created, ctx.project));
});

async function openMilestone(req: Request, res: Response, ctx: Ctx) {
  const mid = idParam.safeParse(req.params.milestoneId);
  if (!mid.success) { res.status(400).json({ error: "Invalid milestone id" }); return null; }
  const milestone = await prisma.taskMilestone.findUnique({ where: { id: mid.data } });
  if (!milestone || milestone.projectId !== ctx.groupId) { res.status(404).json({ error: "Milestone not found." }); return null; }
  return milestone;
}

tasksRouter.patch("/api/groups/:id/milestones/:milestoneId", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can manage milestones.")) return;
  const milestone = await openMilestone(req, res, ctx);
  if (!milestone) return;
  const body = milestoneSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid milestone." }); return; }
  const updated = await prisma.taskMilestone.update({
    where: { id: milestone.id },
    data: {
      ...(body.data.name !== undefined ? { name: body.data.name } : {}),
      ...(body.data.dueDate !== undefined ? { dueDate: body.data.dueDate ? parseDateOnly(body.data.dueDate) : null } : {}),
    },
  });
  res.json(serializeMilestone(updated, ctx.project));
});

tasksRouter.delete("/api/groups/:id/milestones/:milestoneId", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can manage milestones.")) return;
  const milestone = await openMilestone(req, res, ctx);
  if (!milestone) return;
  await prisma.taskMilestone.delete({ where: { id: milestone.id } }); // tasks keep existing; milestoneId is set null
  res.json({ message: "Milestone deleted." });
});

// ── Labels (leader only) ──────────────────────────────────────────────────────

const labelSchema = z.object({
  name: z.string().trim().min(1).max(TASK_LIMITS.labelName),
  color: z.enum(TASK_LABEL_COLORS),
});

async function labelNameTaken(projectId: number, name: string, exceptId?: number): Promise<boolean> {
  const found = await prisma.taskLabel.findFirst({
    where: { projectId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  return !!found;
}

tasksRouter.post("/api/groups/:id/labels", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can manage labels.")) return;
  const body = labelSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: `A label needs a name (max ${TASK_LIMITS.labelName} characters) and a color from the list.` }); return; }
  if ((await prisma.taskLabel.count({ where: { projectId: ctx.groupId } })) >= TASK_LIMITS.labelsPerGroup) {
    res.status(400).json({ error: `A group can have at most ${TASK_LIMITS.labelsPerGroup} labels.` });
    return;
  }
  if (await labelNameTaken(ctx.groupId, body.data.name)) {
    res.status(409).json({ error: "A label with that name already exists." });
    return;
  }
  const created = await prisma.taskLabel.create({ data: { projectId: ctx.groupId, ...body.data } });
  res.status(201).json({ id: created.id, name: created.name, color: created.color });
});

async function openLabel(req: Request, res: Response, ctx: Ctx) {
  const lid = idParam.safeParse(req.params.labelId);
  if (!lid.success) { res.status(400).json({ error: "Invalid label id" }); return null; }
  const label = await prisma.taskLabel.findUnique({ where: { id: lid.data } });
  if (!label || label.projectId !== ctx.groupId) { res.status(404).json({ error: "Label not found." }); return null; }
  return label;
}

tasksRouter.patch("/api/groups/:id/labels/:labelId", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can manage labels.")) return;
  const label = await openLabel(req, res, ctx);
  if (!label) return;
  const body = labelSchema.partial().safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid label." }); return; }
  if (body.data.name !== undefined && (await labelNameTaken(ctx.groupId, body.data.name, label.id))) {
    res.status(409).json({ error: "A label with that name already exists." });
    return;
  }
  const updated = await prisma.taskLabel.update({ where: { id: label.id }, data: body.data });
  res.json({ id: updated.id, name: updated.name, color: updated.color });
});

tasksRouter.delete("/api/groups/:id/labels/:labelId", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res, { write: true });
  if (!ctx) return;
  if (!leaderOnly(res, ctx.actor, "Only the group leader can manage labels.")) return;
  const label = await openLabel(req, res, ctx);
  if (!label) return;
  await prisma.taskLabel.delete({ where: { id: label.id } });
  res.json({ message: "Label deleted." });
});

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { AssignmentTaskSummary } from "@shared/taskTypes.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { assertOwnsAssignment } from "../lib/ownership.js";
import { formatDateOnly, manilaToday } from "../lib/taskBoard.js";
import { computeWorkload, summarizeGroupTasks, type SummaryTask } from "../lib/taskOverviewSummary.js";
import { openGroup } from "./tasks.js";

// Phase 7: the leader's Workload panel and the instructor's class-page task cards. Read-only counts of
// planning data; nothing here is read by scoring, the analysis or the AI narrative, and a task count is
// never a measure of anyone's contribution.

export const taskOverviewRouter = Router();

const toSummaryTask = (t: { status: SummaryTask["status"]; assignedToUserId: number | null; dueDate: Date | null; milestoneId: number | null }): SummaryTask => ({
  status: t.status,
  assignedToUserId: t.assignedToUserId,
  dueDate: formatDateOnly(t.dueDate),
  milestoneId: t.milestoneId,
});

// GET /api/groups/:id/tasks/workload: the group leader, the instructor who owns the class, and admins.
taskOverviewRouter.get("/api/groups/:id/tasks/workload", requireAuth, async (req: Request, res: Response) => {
  const ctx = await openGroup(req, res);
  if (!ctx) return;
  const { actor, project, groupId } = ctx;
  if (!(actor.isLeader || actor.isOwningInstructor || actor.isAdmin)) {
    res.status(403).json({ error: "Only the group leader, the class instructor and admins can see the workload." });
    return;
  }
  const tasks = await prisma.task.findMany({
    where: { projectId: groupId },
    select: { status: true, assignedToUserId: true, dueDate: true, milestoneId: true },
  });
  const members = project.groupMemberships.map((m) => ({ userId: m.user.id, name: m.user.name }));
  res.set("Cache-Control", "private, no-cache");
  res.vary("Authorization");
  res.json(computeWorkload(groupId, tasks.map(toSummaryTask), members, manilaToday()));
});

// GET /api/assignments/:id/task-summary: the class page's per-group task cards (owning instructor, admin).
taskOverviewRouter.get("/api/assignments/:id/task-summary", ...requireRole("INSTRUCTOR", "ADMIN"), async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid assignment id" }); return; }
  const assignment = await assertOwnsAssignment(req, res, id.data);
  if (!assignment) return;

  const groups = await prisma.project.findMany({
    where: { assignmentId: id.data },
    select: { id: true, groupName: true },
    orderBy: { id: "asc" },
  });
  const ids = groups.map((g) => g.id);
  const [tasks, milestones] = ids.length
    ? await Promise.all([
        prisma.task.findMany({ where: { projectId: { in: ids } }, select: { projectId: true, status: true, assignedToUserId: true, dueDate: true, milestoneId: true } }),
        prisma.taskMilestone.findMany({ where: { projectId: { in: ids } }, select: { id: true, projectId: true, name: true, dueDate: true, position: true } }),
      ])
    : [[], []];

  const today = manilaToday();
  const body: AssignmentTaskSummary = {
    assignmentId: id.data,
    groups: groups.map((g) =>
      summarizeGroupTasks(
        g,
        tasks.filter((t) => t.projectId === g.id).map(toSummaryTask),
        milestones.filter((m) => m.projectId === g.id).map((m) => ({ id: m.id, name: m.name, dueDate: formatDateOnly(m.dueDate), position: m.position })),
        today,
      ),
    ),
  };
  res.set("Cache-Control", "private, no-cache");
  res.vary("Authorization");
  res.json(body);
});

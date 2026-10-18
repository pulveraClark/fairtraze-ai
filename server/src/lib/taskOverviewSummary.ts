import type { GroupTaskSummary, WorkloadMember, WorkloadResponse } from "@shared/taskTypes.js";

// Pure summaries for the leader's Workload panel and the instructor's class-page task cards. Planning data
// only: nothing here is read by scoring, and the numbers are counts of tasks, never a measure of effort.

type Status = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";

export interface SummaryTask {
  status: Status;
  assignedToUserId: number | null;
  /** "YYYY-MM-DD" or null. */
  dueDate: string | null;
  milestoneId: number | null;
}

/** "YYYY-MM-DD" plus `days`, with UTC arithmetic so no time zone can move the day. */
function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Sunday-to-Saturday week containing `today` (the same weeks the Calendar view shows). */
export function weekRangeIso(today: string): { start: string; end: string } {
  const dow = new Date(`${today}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  const start = addDaysIso(today, -dow);
  return { start, end: addDaysIso(start, 6) };
}

const isOpen = (t: { status: Status }) => t.status !== "DONE";
const isOverdue = (t: SummaryTask, today: string) => isOpen(t) && !!t.dueDate && t.dueDate < today;

export function computeWorkload(
  groupId: number,
  tasks: SummaryTask[],
  members: { userId: number; name: string }[],
  today: string,
): WorkloadResponse {
  const { end } = weekRangeIso(today);
  const byMember = new Map<number, WorkloadMember>(
    members.map((m) => [m.userId, { userId: m.userId, name: m.name, open: 0, overdue: 0, dueThisWeek: 0, inReview: 0, done: 0 }]),
  );
  const unassigned = { open: 0, overdue: 0 };

  for (const t of tasks) {
    if (t.assignedToUserId === null) {
      if (isOpen(t)) unassigned.open++;
      if (isOverdue(t, today)) unassigned.overdue++;
      continue;
    }
    const row = byMember.get(t.assignedToUserId);
    if (!row) continue; // assigned to someone who has left the group: not part of anyone's workload
    if (t.status === "DONE") { row.done++; continue; }
    row.open++;
    if (t.status === "IN_REVIEW") row.inReview++;
    if (t.dueDate && t.dueDate < today) row.overdue++;
    else if (t.dueDate && t.dueDate <= end) row.dueThisWeek++;
  }

  // Most open work first; ties by name, so the order never jumps around.
  const sorted = [...byMember.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  return { groupId, today, members: sorted, unassigned };
}

export function summarizeGroupTasks(
  project: { id: number; groupName: string },
  tasks: SummaryTask[],
  milestones: { id: number; name: string; dueDate: string | null; position: number }[],
  today: string,
): GroupTaskSummary {
  return {
    projectId: project.id,
    groupName: project.groupName.trim() || `Group ${project.id}`,
    total: tasks.length,
    done: tasks.filter((t) => t.status === "DONE").length,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    milestones: [...milestones]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((m) => {
        const inMs = tasks.filter((t) => t.milestoneId === m.id);
        return { id: m.id, name: m.name, dueDate: m.dueDate, total: inMs.length, done: inMs.filter((t) => t.status === "DONE").length };
      }),
  };
}

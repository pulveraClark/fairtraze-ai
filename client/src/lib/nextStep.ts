// The calm "Next step" line that replaces the setup card once setup is complete. It only rewords data the
// page already has (the viewer's own open tasks); no AI, no new request, nothing about scores.

import { addDays, isOverdue, todayManila } from "./tasks/dates";

interface TaskLike {
  assignedToUserId: number | null;
  status: string;
  dueDate: string | null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function dayName(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(new Date(`${date}T00:00:00.000Z`));
}

/** The viewer's most pressing own task fact, or null when there is nothing useful to say. */
export function taskNextStep(tasks: readonly TaskLike[], userId: number | null, today: string = todayManila()): string | null {
  if (userId === null) return null;
  const mine = tasks.filter((t) => t.assignedToUserId === userId && t.status !== "DONE" && t.dueDate);
  const overdue = mine.filter((t) => isOverdue(t.dueDate, t.status, today)).length;
  if (overdue > 0) return `You have ${overdue} overdue ${plural(overdue, "task", "tasks")}`;

  // Due within the coming week: say the soonest day and how many are due on it.
  const weekEnd = addDays(today, 6);
  const upcoming = mine.filter((t) => t.dueDate! >= today && t.dueDate! <= weekEnd).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  if (upcoming.length === 0) return null;
  const first = upcoming[0]!.dueDate!;
  const n = upcoming.filter((t) => t.dueDate === first).length;
  return `You have ${n} ${plural(n, "task", "tasks")} due ${dayName(first, today)}`;
}

/** What the line says, or null to hide it (nothing useful to say). Finishing setup is announced by a toast instead. */
export function nextStepText(opts: { tasks: readonly TaskLike[]; userId: number | null; today?: string }): string | null {
  return taskNextStep(opts.tasks, opts.userId, opts.today);
}

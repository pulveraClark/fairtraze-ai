// Date helpers for the Tasks board. Due dates are calendar dates ("YYYY-MM-DD") with no time zone;
// "today" is the school's day (Asia/Manila), the same rule the server uses.

export function todayManila(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

function parse(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** "Nov 14" (adds the year when it is not the current year). */
export function formatDue(date: string, today: string = todayManila()): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }),
  }).format(parse(date));
}

/** The Sunday-to-Saturday week containing `today`. */
export function weekRange(today: string): { start: string; end: string } {
  const dow = parse(today).getUTCDay(); // 0 = Sunday
  const start = addDays(today, -dow);
  return { start, end: addDays(start, 6) };
}

export type DueBucket = "overdue" | "this-week" | "later";

export function isOverdue(dueDate: string | null, status: string, today: string = todayManila()): boolean {
  return !!dueDate && status !== "DONE" && dueDate < today;
}

/** Overdue (not Done and before today), this week (today..Saturday), later, or null (no date / done & past). */
export function dueBucket(dueDate: string | null, status: string, today: string = todayManila()): DueBucket | null {
  if (!dueDate) return null;
  if (isOverdue(dueDate, status, today)) return "overdue";
  const { end } = weekRange(today);
  if (dueDate >= today && dueDate <= end) return "this-week";
  if (dueDate > end) return "later";
  return null;
}

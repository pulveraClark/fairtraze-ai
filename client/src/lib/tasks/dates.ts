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

// ── Calendar helpers. Everything is done on "YYYY-MM-DD" strings with UTC arithmetic, never on
// local-time Dates, so no browser time zone can move a day (the Manila-midnight off-by-one). ──

/** "2026-11" for a date string. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month key ("YYYY-MM") moved by `delta` months. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/**
 * The 6 Sunday-to-Saturday weeks (42 days) that cover a month, including the leading and trailing
 * days of the neighbouring months.
 */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -parse(first).getUTCDay());
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** "November 2026". */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(parse(`${month}-01`));
}

/** "Saturday, November 14, 2026" for screen readers. */
export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(parse(date));
}

/** The school day (Asia/Manila) an instant falls on, e.g. the project deadline. */
export function manilaDateOf(iso: string): string {
  return todayManila(new Date(iso));
}

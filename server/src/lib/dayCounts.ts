// Calendar day (YYYY-MM-DD) in this one constant time zone, used for the analysis progress
// stream's "activity by day" counts (commits and edit sessions alike).
export const ANALYSIS_TIME_ZONE = "Asia/Manila";

// en-CA formats dates as YYYY-MM-DD.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ANALYSIS_TIME_ZONE,
  year:     "numeric",
  month:    "2-digit",
  day:      "2-digit",
});

export interface DayCount { d: string; n: number }

/** Raw per-day counts of the given ISO timestamps, oldest day first. Invalid dates are skipped. */
export function countByDay(isoDates: readonly string[]): DayCount[] {
  const counts = new Map<string, number>();
  for (const iso of isoDates) {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) continue;
    const d = dayFormatter.format(t);
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([d, n]) => ({ d, n }));
}

// Calendar day (YYYY-MM-DD) in the one scoring time zone (Asia/Manila), shared with scoring so the
// progress stream's "activity by day" counts and the active-day counts always agree.
import { ANALYSIS_TIME_ZONE, analysisDayOf } from "@shared/analysisDay.js";
export { ANALYSIS_TIME_ZONE };

export interface DayCount { d: string; n: number }

/** Raw per-day counts of the given ISO timestamps, oldest day first. Invalid dates are skipped. */
export function countByDay(isoDates: readonly string[]): DayCount[] {
  const counts = new Map<string, number>();
  for (const iso of isoDates) {
    const d = analysisDayOf(iso);
    if (d === null) continue;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([d, n]) => ({ d, n }));
}

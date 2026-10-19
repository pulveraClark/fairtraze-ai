// The one calendar-day rule for scoring: a "day" is a day in Philippine time (Asia/Manila), the
// same rule the task due sweep and the analysis progress stream use. Active days (GitHub and
// Docs) are counted with it, never with the UTC date.
export const ANALYSIS_TIME_ZONE = "Asia/Manila";

// en-CA formats dates as YYYY-MM-DD.
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ANALYSIS_TIME_ZONE,
  year:     "numeric",
  month:    "2-digit",
  day:      "2-digit",
});

/** The Asia/Manila calendar day (YYYY-MM-DD) an ISO timestamp falls on; null if it is not a valid date. */
export function analysisDayOf(iso: string | number | Date): string | null {
  const t = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(t.getTime()) ? null : dayFormatter.format(t);
}

/** Number of distinct Asia/Manila days among the given ISO timestamps (invalid dates skipped). */
export function countDistinctAnalysisDays(isoDates: readonly string[]): number {
  const days = new Set<string>();
  for (const iso of isoDates) {
    const d = analysisDayOf(iso);
    if (d) days.add(d);
  }
  return days.size;
}

// Display only: how much recorded activity stands behind a report, so screens can say "Early data" when the
// result should be read with care. Computed at read time, never stored. NOT imported by scoring, the analyzer,
// alerts or exports (server/test/dataConfidenceIsolation.test.ts and dataConfidence.test.ts assert it): no score,
// flag, Gini value or team-health label depends on it.

/** Active days of the group's most active member: below `low` is "low", below `high` is "medium", else "high". */
export const DATA_CONFIDENCE_DAYS = { low: 5, high: 15 } as const;

export type DataConfidence = "low" | "medium" | "high";

/** Just the activity-day counts that exist on every scored-member shape (GitHub, Docs and Combined). */
export interface ActiveDaysSource {
  activeDays?: number | null;
  github?: { activeDays?: number | null } | null;
  document?: { activeDays?: number | null } | null;
}

/** The most active member's active days (the proxy used for the whole group). Combined members use their larger source. */
export function mostActiveMemberDays(members: ReadonlyArray<ActiveDaysSource>): number {
  let best = 0;
  for (const m of members) {
    for (const d of [m.activeDays, m.github?.activeDays, m.document?.activeDays]) {
      if (typeof d === "number" && Number.isFinite(d) && d > best) best = d;
    }
  }
  return best;
}

export interface DataConfidenceInput {
  /** From mostActiveMemberDays. */
  activeDays: number;
  /** The Docs "may be approximate" notice applies (the server only sets it for Docs and Combined groups). */
  docsApproximate?: boolean;
  /** Nobody has any recorded activity: the existing "Not enough activity yet" state covers it, so there is no level. */
  noActivity?: boolean;
}

/** null when nobody has recorded activity (no tag; the no-activity state already says so). */
export function dataConfidence({ activeDays, docsApproximate = false, noActivity = false }: DataConfidenceInput): DataConfidence | null {
  if (noActivity) return null;
  if (docsApproximate) return "low";
  if (activeDays < DATA_CONFIDENCE_DAYS.low) return "low";
  if (activeDays < DATA_CONFIDENCE_DAYS.high) return "medium";
  return "high";
}

/** The levels a screen shows a tag for. "high" and null show nothing. */
export function showsEarlyDataTag(level: DataConfidence | null | undefined): level is "low" | "medium" {
  return level === "low" || level === "medium";
}

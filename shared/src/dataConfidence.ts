// Display only: how much recorded activity stands behind a report, so screens can say "Early data" when the
// result should be read with care. Computed at read time, never stored. NOT imported by scoring, the analyzer,
// alerts or exports (server/test/dataConfidencePayload.test.ts and dataConfidence.test.ts assert it): no score,
// flag, Gini value or team-health label depends on it.
import { analysisDayOf } from "./analysisDay.js";

/** Active days of the group's most active member: below `low` is "low", below `high` is "medium", else "high". */
export const DATA_CONFIDENCE_DAYS = { low: 5, high: 15 } as const;

/** "final" = the project's due date has ended, so the data is final and is not "early" any more. */
export type DataConfidence = "low" | "medium" | "high" | "final";

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

/**
 * True once the project's due DATE has ended in Manila time (the one calendar-day rule, `analysisDayOf`).
 * The instructor picks a date; the client stores it as midnight at the start of that date, so the stored instant
 * is only used to find the due date. A project due on the 10th is still "not passed" until the 11th begins in Manila.
 * No deadline (or an unreadable one) is never "passed".
 */
export function isDeadlinePassed(deadline: Date | string | number | null | undefined, now: Date | number = Date.now()): boolean {
  if (deadline === null || deadline === undefined) return false;
  const due = analysisDayOf(deadline);
  const today = analysisDayOf(now);
  return !!due && !!today && today > due; // YYYY-MM-DD strings compare in date order
}

export interface DataConfidenceInput {
  /** From mostActiveMemberDays. */
  activeDays: number;
  /** The Docs "may be approximate" notice applies (the server only sets it for Docs and Combined groups). */
  docsApproximate?: boolean;
  /** Nobody has any recorded activity: the existing "Not enough activity yet" state covers it, so there is no level. */
  noActivity?: boolean;
  /** From isDeadlinePassed. After the deadline the data is final, whatever the day count or Docs notice says. */
  deadlinePassed?: boolean;
}

/**
 * Order: nobody has activity -> null ("Not enough activity yet" keeps its own words); deadline passed -> "final";
 * then approximate Docs data or fewer than 5 days -> "low"; 5 to 14 -> "medium"; 15 or more -> "high".
 */
export function dataConfidence({ activeDays, docsApproximate = false, noActivity = false, deadlinePassed = false }: DataConfidenceInput): DataConfidence | null {
  if (noActivity) return null;
  if (deadlinePassed) return "final";
  if (docsApproximate) return "low";
  if (activeDays < DATA_CONFIDENCE_DAYS.low) return "low";
  if (activeDays < DATA_CONFIDENCE_DAYS.high) return "medium";
  return "high";
}

/** The levels a screen shows a tag for. "high", "final" and null show nothing. */
export function showsEarlyDataTag(level: DataConfidence | null | undefined): level is "low" | "medium" {
  return level === "low" || level === "medium";
}

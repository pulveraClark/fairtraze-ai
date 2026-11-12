// Wording and timing for "how fresh is this report" (automatic analysis). Display only.

/** How often the page asks for the new report while an automatic refresh is running. */
export const AUTO_REFRESH_POLL_MS = 10_000;
/** After this long the page stops waiting and silently keeps the report it already has. */
export const AUTO_REFRESH_POLL_MAX_MS = 3 * 60 * 1000;

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export function relativeTime(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor(Math.max(0, now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.floor(hours / 24), "day");
}

/** Mirrors ACTIVE_GRACE_DAYS in server/src/lib/autoAnalysis.ts: automatic analysis stops this long after the deadline. */
export const AUTO_ANALYSIS_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** True once automatic analysis has stopped: a deadline exists and now is more than 7 days past it (same rule as the server's isProjectActive). */
export function isAutoAnalysisClosed(deadline: string | null | undefined, now: Date = new Date()): boolean {
  if (!deadline) return false;
  const due = new Date(deadline).getTime();
  if (Number.isNaN(due)) return false;
  return now.getTime() > due + AUTO_ANALYSIS_GRACE_DAYS * DAY_MS;
}

/**
 * Active: "Last analyzed 3 hours ago (manual) · Re-analyzes automatically when there is new activity".
 * Closed: "Last analyzed 15 days ago · Final report, no more automatic updates".
 */
export function formatLastAnalyzed(iso: string, trigger?: "manual" | "auto" | null, now: Date = new Date(), closed = false): string {
  if (closed) return `Last analyzed ${relativeTime(iso, now)} · Final report, no more automatic updates`;
  const who = trigger === "auto" ? " (automatic)" : trigger === "manual" ? " (manual)" : "";
  return `Last analyzed ${relativeTime(iso, now)}${who} · Re-analyzes automatically when there is new activity`;
}

/** The students' line: "Last analyzed 14 hours ago. Updates again when there is new activity." / "... Final report, no more updates." */
export function formatLastAnalyzedStudent(iso: string, now: Date = new Date(), closed = false): string {
  return closed
    ? `Last analyzed ${relativeTime(iso, now)}. Final report, no more updates.`
    : `Last analyzed ${relativeTime(iso, now)}. Updates again when there is new activity.`;
}

/** "Last analyzed 3 hours ago": the short form for lists and summary cards. */
export function formatLastAnalyzedShort(iso: string, now: Date = new Date()): string {
  return `Last analyzed ${relativeTime(iso, now)}`;
}

/** "Oct 20, 2026, 3:45 PM" on the school's Manila clock, for a tooltip beside the relative time. */
export function formatAnalyzedExact(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** The latest automatic update did not finish. Same words for everyone; no cause, no blame. */
export const AUTO_UPDATE_FAILED_TEXT = "The latest update didn't finish. It will try again tonight.";

/** "Last analyzed 3 days ago. The latest update didn't finish. It will try again tonight." */
export function formatLastAnalyzedUpdateFailed(iso: string, now: Date = new Date()): string {
  return `Last analyzed ${relativeTime(iso, now)}. ${AUTO_UPDATE_FAILED_TEXT}`;
}

export const UPDATING_TEXT = "Updating…";
export const NARRATIVE_OUTDATED_TEXT = "Results changed. Generate new AI findings.";

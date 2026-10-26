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

/** "Last analyzed 3 hours ago · Updates automatically", with "(automatic)" or "(manual)" when known. */
export function formatLastAnalyzed(iso: string, trigger?: "manual" | "auto" | null, now: Date = new Date()): string {
  const who = trigger === "auto" ? " (automatic)" : trigger === "manual" ? " (manual)" : "";
  return `Last analyzed ${relativeTime(iso, now)}${who} · Updates automatically`;
}

export const UPDATING_TEXT = "Updating…";
export const NARRATIVE_OUTDATED_TEXT = "Results changed. Generate a new explanation.";

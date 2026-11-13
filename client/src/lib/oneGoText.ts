// Wording for the instructor's "added in one go" line. Display only; instructor screens only.
// The day comes from the server as an Asia/Manila calendar day (YYYY-MM-DD); it is formatted with
// UTC arithmetic so the viewer's time zone can never shift it. No character count is ever shown.
import { ONE_GO_MIN_CHARS } from "@shared/oneGoHint";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 10" for "2026-11-10"; null when the value is not a calendar day. */
export function oneGoDayLabel(day: string | undefined | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  if (!m) return null;
  const month = Number(m[2]);
  const date = Number(m[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return `${MONTHS[month - 1]} ${date}`;
}

/** The one calm line. Asks the instructor to check; never says why or accuses. */
export function oneGoLine(day: string | undefined | null): string {
  const label = oneGoDayLabel(day);
  return `Worth a look: a large part of this member's text was added in one go${label ? ` on ${label}` : ""}. Please compare snapshots in the document history.`;
}

export const ONE_GO_HISTORY_BUTTON = "Open document history";

export const ONE_GO_TIP =
  `Found by counting: one single insert of about ${ONE_GO_MIN_CHARS.toLocaleString("en-US")} characters or more that makes up most of the member's kept text. ` +
  "Text brought in from Word or from the member's own notes looks the same. History keeps one snapshot per analysis run, so compare snapshots around that date.";

// Display-only helper: does a stored report show no recorded activity at all?
// It never feeds scoring, flags or the AI input; it only lets the student pages say
// "Not enough activity yet" instead of a health label and "inactive 0%" pills.

/** True when there is at least one member and every member's contribution share is 0. */
export function hasNoRecordedActivity(members: ReadonlyArray<{ contributionShare?: number | null }>): boolean {
  return members.length > 0 && members.every((m) => !m.contributionShare);
}

/**
 * Same check on a stored Report.content JSON string; an unreadable report is treated as "has activity" (shows as before).
 * Real content is `{ report: { members }, narrative, ... }`; a bare top-level `members` is still read for older shapes.
 */
export function contentHasNoRecordedActivity(content: string | null | undefined): boolean {
  if (!content) return false;
  try {
    type Members = Array<{ contributionShare?: number | null }>;
    const parsed = JSON.parse(content) as { report?: { members?: Members }; members?: Members };
    const members = parsed.report?.members ?? parsed.members;
    return Array.isArray(members) && hasNoRecordedActivity(members);
  } catch {
    return false;
  }
}

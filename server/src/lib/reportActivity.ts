// Display-only helper: does a stored report show no recorded activity at all?
// It never feeds scoring, flags or the AI input; it only lets the student pages say
// "Not enough activity yet" instead of a health label and "inactive 0%" pills.

/** True when there is at least one member and every member's contribution share is 0. */
export function hasNoRecordedActivity(members: ReadonlyArray<{ contributionShare?: number | null }>): boolean {
  return members.length > 0 && members.every((m) => !m.contributionShare);
}

/** Same check on a stored Report.content JSON string; an unreadable report is treated as "has activity" (shows as before). */
export function contentHasNoRecordedActivity(content: string | null | undefined): boolean {
  if (!content) return false;
  try {
    const parsed = JSON.parse(content) as { members?: Array<{ contributionShare?: number | null }> };
    return Array.isArray(parsed.members) && hasNoRecordedActivity(parsed.members);
  } catch {
    return false;
  }
}

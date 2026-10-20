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

export type QuietSource = "GitHub" | "Docs";

interface CombinedActivityMember {
  githubContributionShare?: number | null;
  documentContributionShare?: number | null;
  github?: { commits?: number | null } | null;
  document?: { sessionCount?: number | null } | null;
}

/**
 * For a Combined report: the one source (GitHub or Docs) in which nobody has any recorded activity while the
 * other has some. Null for non-Combined members, when both sources are quiet (the no-activity card covers that),
 * or when both have activity. Display only.
 */
export function quietSource(all: ReadonlyArray<object>): QuietSource | null {
  const members = all as ReadonlyArray<CombinedActivityMember>;
  const isCombined = members.length > 0 && members.every((m) => "githubContributionShare" in m && "documentContributionShare" in m);
  if (!isCombined) return null;
  const githubQuiet = members.every((m) => !m.githubContributionShare && !m.github?.commits);
  const docsQuiet = members.every((m) => !m.documentContributionShare && !m.document?.sessionCount);
  if (githubQuiet === docsQuiet) return null;
  return githubQuiet ? "GitHub" : "Docs";
}

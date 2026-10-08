// Workload hint for the task Assign-to picker (leader/instructor only).
// Display-only: it never affects contribution scores, flags or any shared/ scoring input,
// and callers must never auto-select the suggestion — the person assigning decides.

export interface WorkloadTask {
  id: number;
  assignedToUserId: number | null;
  done: boolean;
}

export interface WorkloadMember {
  userId: number;
  name: string;
}

export interface WorkloadEntry {
  userId: number;
  name: string;
  open: number;
}

export interface WorkloadHint {
  entries: WorkloadEntry[];
  /** userId of the suggested member, or null when there are no members. */
  suggestedUserId: number | null;
}

/**
 * Open-task count per member plus the suggested assignee: fewest open tasks wins; ties go to the
 * lower contribution share (members without a stored share sort after those with one), then
 * alphabetical. `excludeTaskId` omits the task being edited so it isn't counted against its
 * current assignee. Open = not done, matching the leader's "Team contributions" card.
 */
export function suggestAssignee(
  members: WorkloadMember[],
  tasks: WorkloadTask[],
  shares: Record<number, number | null> = {},
  excludeTaskId?: number,
): WorkloadHint {
  const counts = new Map<number, number>();
  for (const t of tasks) {
    if (t.done || t.id === excludeTaskId || t.assignedToUserId === null) continue;
    counts.set(t.assignedToUserId, (counts.get(t.assignedToUserId) ?? 0) + 1);
  }
  const entries = members.map((m) => ({ userId: m.userId, name: m.name, open: counts.get(m.userId) ?? 0 }));

  const ranked = [...entries].sort((a, b) => {
    if (a.open !== b.open) return a.open - b.open;
    const sa = shares[a.userId] ?? null;
    const sb = shares[b.userId] ?? null;
    if (sa !== null && sb !== null && sa !== sb) return sa - sb;
    if (sa !== null && sb === null) return -1;
    if (sa === null && sb !== null) return 1;
    return a.name.localeCompare(b.name);
  });
  return { entries, suggestedUserId: ranked[0]?.userId ?? null };
}

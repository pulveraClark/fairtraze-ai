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

// ── Suggested assignee for one task (leader-only hint in the details window) ─────────────────────
// Eligible = holds the role the task needs (a task linked to a document heading, or labelled "Documentation",
// needs Documentation; anything else Developer), else everyone. Then: skip members flagged Overload, take the
// LOWEST contribution share from the latest saved report, tie-break fewest open tasks, then name. Without a
// saved report (or a share) it is fewest open tasks, then name. Display only: the leader confirms or picks
// someone else, and nothing here writes a score. Shares come from the server's leader-only `assigneeHints`.

export interface RoleMember extends WorkloadMember {
  functionalRoles: string[];
}

export type SuggestedRole = "DOCUMENTATION" | "DEVELOPER";

export const ROLE_NAMES: Record<SuggestedRole, string> = { DOCUMENTATION: "Documentation", DEVELOPER: "Developer" };

export interface AssigneeHintInput {
  userId: number;
  share: number | null;
  overloaded: boolean;
}

export const SUGGEST_REASON_LOWEST = "Lowest contribution so far.";
export const SUGGEST_REASON_FEWEST = "Fewest open tasks";

export interface AssigneeSuggestion {
  userId: number;
  name: string;
  role: SuggestedRole;
  /** Whether the suggested member actually holds the role (false when nobody does and everyone was considered). */
  roleMatched: boolean;
  open: number;
  /** "Lowest contribution so far." or "Fewest open tasks". Plain words only. */
  reason: string;
}

export function taskRoleNeeded(task: { docHeading: string | null }, labelNames: string[]): SuggestedRole {
  return task.docHeading || labelNames.some((n) => n.trim().toLowerCase() === "documentation") ? "DOCUMENTATION" : "DEVELOPER";
}

/** Shares are compared at the precision people see (one decimal of a percent), so 6.2% and 6.2% are a tie. */
const shareKey = (share: number) => Math.round(share * 1000);

export function suggestAssigneeForTask(
  members: RoleMember[],
  tasks: WorkloadTask[],
  task: { id: number; docHeading: string | null },
  labelNames: string[],
  hints: AssigneeHintInput[] = [],
): AssigneeSuggestion | null {
  if (members.length === 0) return null;
  const role = taskRoleNeeded(task, labelNames);
  const { entries } = suggestAssignee(members, tasks, {}, task.id);
  const hintOf = new Map(hints.map((h) => [h.userId, h]));
  const holders = new Set(members.filter((m) => m.functionalRoles.includes(role)).map((m) => m.userId));

  const roleMatched = entries.some((e) => holders.has(e.userId));
  let pool = roleMatched ? entries.filter((e) => holders.has(e.userId)) : entries;
  const notOverloaded = pool.filter((e) => !hintOf.get(e.userId)?.overloaded);
  if (notOverloaded.length > 0) pool = notOverloaded; // everyone overloaded: still pick someone, never an empty card

  const shareOf = (userId: number) => hintOf.get(userId)?.share ?? null;
  const withShare = pool.filter((e) => shareOf(e.userId) !== null);
  const byShare = withShare.length >= 2; // "lowest" only means something when at least two can be compared
  const ranked = [...pool].sort((a, b) => {
    if (byShare) {
      const sa = shareOf(a.userId);
      const sb = shareOf(b.userId);
      if (sa !== null && sb !== null && shareKey(sa) !== shareKey(sb)) return shareKey(sa) - shareKey(sb);
      if (sa !== null && sb === null) return -1;
      if (sa === null && sb !== null) return 1;
    }
    return a.open - b.open || a.name.localeCompare(b.name);
  });
  const pick = ranked[0]!;
  const reason = byShare && shareOf(pick.userId) !== null ? SUGGEST_REASON_LOWEST : SUGGEST_REASON_FEWEST;
  return { userId: pick.userId, name: pick.name, role, roleMatched, open: pick.open, reason };
}

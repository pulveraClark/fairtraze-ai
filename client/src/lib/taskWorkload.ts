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
// Role match first (a task linked to a document heading, or labelled "Documentation", goes to
// Documentation members; anything else to Developers), then fewest open tasks. Display only: the
// leader confirms or picks someone else, and nothing here touches a score.

export interface RoleMember extends WorkloadMember {
  functionalRoles: string[];
}

export type SuggestedRole = "DOCUMENTATION" | "DEVELOPER";

export const ROLE_NAMES: Record<SuggestedRole, string> = { DOCUMENTATION: "Documentation", DEVELOPER: "Developer" };

export interface AssigneeSuggestion {
  userId: number;
  name: string;
  role: SuggestedRole;
  /** Whether the suggested member actually holds the role (false for the fewest-open-tasks fallback). */
  roleMatched: boolean;
  open: number;
  /** One sentence naming the real roles, e.g. "Documentation member with the fewest open tasks (1)". */
  reason: string;
}

export function taskRoleNeeded(task: { docHeading: string | null }, labelNames: string[]): SuggestedRole {
  return task.docHeading || labelNames.some((n) => n.trim().toLowerCase() === "documentation") ? "DOCUMENTATION" : "DEVELOPER";
}

export function suggestAssigneeForTask(
  members: RoleMember[],
  tasks: WorkloadTask[],
  task: { id: number; docHeading: string | null },
  labelNames: string[],
): AssigneeSuggestion | null {
  if (members.length === 0) return null;
  const role = taskRoleNeeded(task, labelNames);
  const { entries } = suggestAssignee(members, tasks, {}, task.id);
  const byOpen = (list: typeof entries) => [...list].sort((a, b) => a.open - b.open || a.name.localeCompare(b.name));

  const holders = new Set(members.filter((m) => m.functionalRoles.includes(role)).map((m) => m.userId));
  const matched = byOpen(entries.filter((e) => holders.has(e.userId)));
  const pick = matched[0] ?? byOpen(entries)[0]!;
  const roleMatched = matched.length > 0;
  const roleName = ROLE_NAMES[role];
  const reason = roleMatched
    ? `${roleName} member with the fewest open tasks (${pick.open})`
    : `Fewest open tasks (${pick.open}); no ${roleName} member`;
  return { userId: pick.userId, name: pick.name, role, roleMatched, open: pick.open, reason };
}

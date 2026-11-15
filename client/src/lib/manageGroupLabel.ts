export interface PendingCounts {
  joinRequests: number;
  roleRequests: number;
}

/** Join requests plus role requests (change-role and add-role are one list on the server). */
export function pendingTotal(counts: PendingCounts | null | undefined): number {
  if (!counts) return 0;
  return Math.max(0, counts.joinRequests) + Math.max(0, counts.roleRequests);
}

/** The button's accessible name. Zero (or no counts, as for a plain member) is just "Manage Group". */
export function manageGroupLabel(total: number): string {
  if (total <= 0) return "Manage Group";
  return `Manage Group, ${total} pending ${total === 1 ? "request" : "requests"}`;
}

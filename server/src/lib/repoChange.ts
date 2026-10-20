import { prisma } from "./prisma.js";

// A linked repository that was changed after a group's latest report makes that report outdated.
// The audit entry written by PUT /api/groups/:id/repo is the record; comparing it with the report's
// time means re-analyzing clears the notice with no extra column and nothing to reset.

export const REPO_CHANGED_ACTION = "GROUP_REPO_CHANGED";

/** Project ids (of those given) whose repo was changed after the time given for them. */
export async function projectsWithRepoChangedSince(since: Map<number, Date>): Promise<Set<number>> {
  if (since.size === 0) return new Set();
  const rows = await prisma.auditLog.findMany({
    where: { action: REPO_CHANGED_ACTION, targetType: "GROUP", targetId: { in: [...since.keys()].map(String) } },
    select: { targetId: true, createdAt: true },
  });
  const changed = new Set<number>();
  for (const r of rows) {
    const id = Number(r.targetId);
    const after = since.get(id);
    if (after && r.createdAt > after) changed.add(id);
  }
  return changed;
}

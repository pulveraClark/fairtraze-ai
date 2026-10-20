import { prisma } from "./prisma.js";

// Member is the legacy per-group roster row (studentName + githubUsername) that the analyzer's
// required-logins fallback still reads. User.githubUsername is the source of truth, so when a user
// changes it every group they belong to gets the same value. Data sync only; no scoring change.

/**
 * Updates Member.githubUsername in every group `userId` belongs to. A row is theirs when it still holds
 * their previous username, or is empty and carries their previous display name (Member has no user id).
 */
export async function syncMemberGithubUsername(
  userId: number,
  previous: { name: string; githubUsername: string | null },
  next: string | null,
): Promise<number> {
  const memberships = await prisma.groupMembership.findMany({ where: { userId }, select: { projectId: true } });
  if (memberships.length === 0) return 0;
  const projectIds = memberships.map((m) => m.projectId);
  const value = next?.trim() ?? "";
  const old = previous.githubUsername?.trim() ?? "";

  const rows = await prisma.member.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, studentName: true, githubUsername: true },
  });
  const mine = rows
    .filter((r) => (old && r.githubUsername.toLowerCase() === old.toLowerCase()) || (!r.githubUsername && r.studentName === previous.name))
    .map((r) => r.id);
  if (mine.length === 0) return 0;
  const { count } = await prisma.member.updateMany({ where: { id: { in: mine } }, data: { githubUsername: value } });
  return count;
}

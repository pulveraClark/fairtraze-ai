import { prisma } from "./prisma.js";

// Member is the legacy per-group roster row (studentName + githubUsername) that the analyzer's
// required-logins fallback still reads. User.githubUsername is the source of truth, so when a user
// changes it every group they belong to gets the same value. Data sync only; no scoring change.

// The prisma client or a transaction client: the helper below works inside either.
type Db = Pick<typeof prisma, "member">;

/**
 * Deletes the legacy Member row that was created for a user who just left or was removed from a group.
 * Member has no user id, so "theirs" uses the same rule as syncMemberGithubUsername, always inside this one
 * group: with a username, rows holding it (case-insensitive); without one, exactly ONE blank-username row
 * carrying their exact display name (lowest id, so two same-named blank members lose one row each).
 * Never deletes by projectId alone. Data cleanup only; no scoring change. Returns how many rows were deleted.
 */
export async function removeMemberRowFor(
  db: Db,
  projectId: number,
  user: { name: string; githubUsername: string | null },
): Promise<number> {
  const login = user.githubUsername?.trim() ?? "";
  if (login) {
    const { count } = await db.member.deleteMany({
      where: { projectId, githubUsername: { equals: login, mode: "insensitive" } },
    });
    return count;
  }
  const row = await db.member.findFirst({
    where: { projectId, githubUsername: "", studentName: user.name },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!row) return 0;
  const { count } = await db.member.deleteMany({ where: { id: row.id, projectId } });
  return count;
}

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

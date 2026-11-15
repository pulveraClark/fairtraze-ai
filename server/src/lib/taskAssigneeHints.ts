import type { AssigneeHint } from "@shared/taskTypes.js";
import type { AnyScoredMember } from "@shared/types.js";
import { prisma } from "./prisma.js";
import { LATEST_REPORT_ORDER } from "./latestReport.js";
import type { LoadedGroup } from "./groupAccess.js";

// Leader-only input for the "Suggested" assignee card: each member's share and whether the latest saved report
// flagged them for overload. READ ONLY: it parses the stored report and never writes a report, flag or score.
// Nothing here is read by scoring.

/** The scored member of a report for one group member (same matching as the leader's team view). */
export function scoredMemberFor(
  reportMembers: AnyScoredMember[],
  sourceType: string | undefined,
  member: { userId: number; githubUsername: string | null },
): AnyScoredMember | undefined {
  if (sourceType === "GITHUB") {
    const gh = member.githubUsername?.toLowerCase();
    return gh ? reportMembers.find((r) => r.githubUsername?.toLowerCase() === gh) : undefined;
  }
  return reportMembers.find((r) => "userId" in r && r.userId === member.userId);
}

/** One entry per group member; `share` is null (and `overloaded` false) when there is no saved report or no share. */
export async function assigneeHintsFor(project: LoadedGroup): Promise<AssigneeHint[]> {
  const latest = await prisma.report.findFirst({
    where: { projectId: project.id },
    orderBy: [...LATEST_REPORT_ORDER],
    select: { content: true },
  });
  let reportMembers: AnyScoredMember[] = [];
  try {
    reportMembers = (JSON.parse(latest?.content ?? "{}") as { report?: { members?: AnyScoredMember[] } }).report?.members ?? [];
  } catch {
    reportMembers = [];
  }
  const sourceType = project.assignment?.sourceType;
  return project.groupMemberships.map((m) => {
    const scored = scoredMemberFor(reportMembers, sourceType, { userId: m.userId, githubUsername: m.user.githubUsername ?? null });
    const share = typeof scored?.contributionShare === "number" ? scored.contributionShare : null;
    return { userId: m.userId, share, overloaded: !!scored?.flags?.includes("overload") };
  });
}

import { prisma } from "./prisma.js";
import { getOrCreateReportId } from "./reportId.js";
import type { EvidenceMemberRow, EvidenceReportDto } from "@shared/evidenceReport.js";
import { classFullLabel } from "@shared/classLabel.js";
import type {
  AnyScoredMember, CombinedScoredMember, DocumentScoredMember, ScoredMember, TeamReport,
} from "@shared/types.js";

// Builds the small whitelisted payload behind the Contribution Evidence Report from a STORED
// analysis. Nothing is recomputed. The DTO type has no field for Gini, bands, team health, index,
// thresholds, AI text, usernames, emails, user ids or commit/line counts, so none can leak here.
// The student endpoint and the instructor's verify endpoint both call this, so a printout and its
// verification always show the same numbers.

const pct = (share: number): number => Math.round(share * 1000) / 10;

interface StoredShape {
  report?: TeamReport<AnyScoredMember>;
  scoringConfig?: { blend?: { wGitHub: number; wDocs: number } };
}

export function evidenceRows(
  members: AnyScoredMember[],
  sourceType: "GITHUB" | "EDITOR" | "COMBINED",
): EvidenceMemberRow[] {
  return members.map((m) => {
    if (sourceType === "GITHUB") {
      const g = m as ScoredMember;
      return { name: g.studentName, githubPct: pct(g.contributionShare), docsPct: null, combinedPct: pct(g.contributionShare), flags: [...g.flags] };
    }
    if (sourceType === "EDITOR") {
      const d = m as DocumentScoredMember;
      return { name: d.studentName, githubPct: null, docsPct: pct(d.contributionShare), combinedPct: pct(d.contributionShare), flags: [...d.flags] };
    }
    const c = m as CombinedScoredMember;
    return {
      name: c.studentName,
      githubPct: pct(c.githubContributionShare),
      docsPct: pct(c.documentContributionShare),
      combinedPct: pct(c.contributionShare),
      flags: [...c.flags],
    };
  });
}

/** Null when the group, its assignment, or the report's stored content is missing. */
export async function buildEvidenceDto(
  projectId: number,
  report: { id: number; generatedAt: Date; content: string | null },
): Promise<EvidenceReportDto | null> {
  if (!report.content) return null;
  let stored: StoredShape;
  try { stored = JSON.parse(report.content) as StoredShape; } catch { return null; }
  const team = stored.report;
  if (!team) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      groupName: true,
      repoUrl: true,
      assignment: {
        select: {
          title: true,
          sourceType: true,
          weightGithub: true,
          weightDocs: true,
          classSection: { select: { subjectCode: true, edpCode: true, department: { select: { name: true } } } },
        },
      },
      groupMemberships: { where: { role: "LEADER" }, select: { user: { select: { name: true } } }, take: 1 },
    },
  });
  if (!project?.assignment) return null;
  const asgn = project.assignment;
  const cs = asgn.classSection;
  const sourceType = asgn.sourceType;

  // The blend that produced these numbers is the one stored with the report; the live assignment
  // value is only a fallback for an old report that did not store it.
  const blend = stored.scoringConfig?.blend ?? { wGitHub: asgn.weightGithub, wDocs: asgn.weightDocs };
  const memberCount = team.members.length;

  return {
    collegeName: cs.department?.name || "College of Computer Studies",
    groupName: project.groupName || `Group ${projectId}`,
    // Same wording as the instructor copy and every other class label: "CODE · EDP 12345", code only without an EDP.
    className: classFullLabel({ subjectCode: cs.subjectCode, edpCode: cs.edpCode }),
    projectTitle: asgn.title,
    repoUrl: sourceType === "EDITOR" ? null : project.repoUrl,
    analyzedAt: report.generatedAt.toISOString(),
    generatedAt: new Date().toISOString(),
    sourceType,
    weights: sourceType === "COMBINED"
      ? { githubPct: Math.round(blend.wGitHub * 100), docsPct: Math.round(blend.wDocs * 100) }
      : null,
    memberCount,
    equalSharePct: memberCount > 0 ? Math.round((1000 / memberCount)) / 10 : 0,
    members: evidenceRows(team.members, sourceType),
    leaderName: project.groupMemberships[0]?.user.name ?? null,
    reportId: await getOrCreateReportId(projectId, report.id),
  };
}

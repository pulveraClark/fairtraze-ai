// Builds the evidence sheet's data from the instructor's STORED report, so the instructor copy is the same
// document as the student's. Rounding is copied exactly from the server (server/src/lib/evidenceReport.ts,
// `pct` and `evidenceRows`, and the equal share / weights lines of `buildEvidenceDto`), so a number printed
// here equals the number the server sends for the same analysis. Nothing is recomputed from raw activity.
import type { EvidenceMemberRow, EvidenceReportDto } from "@shared/evidenceReport";
import type {
  AnyScoredMember, CombinedScoredMember, DocumentScoredMember, ScoredMember, StoredReportResponse,
} from "@shared/types";
import { exportClassLabel, type ExportClassSource } from "./classLabel";

/** Server: `Math.round(share * 1000) / 10` (one decimal, half rounds up). */
export const sharePct = (share: number): number => Math.round(share * 1000) / 10;

/** Server: `Math.round(1000 / memberCount) / 10`. */
export const equalSharePct = (memberCount: number): number => (memberCount > 0 ? Math.round(1000 / memberCount) / 10 : 0);

/** Server: `Math.round(weight * 100)`. */
export const weightPct = (weight: number): number => Math.round(weight * 100);

export function evidenceRowsFromStored(
  members: AnyScoredMember[],
  sourceType: EvidenceReportDto["sourceType"],
): EvidenceMemberRow[] {
  return members.map((m) => {
    if (sourceType === "GITHUB") {
      const g = m as ScoredMember;
      return { name: g.studentName, githubPct: sharePct(g.contributionShare), docsPct: null, combinedPct: sharePct(g.contributionShare), flags: [...g.flags] };
    }
    if (sourceType === "EDITOR") {
      const d = m as DocumentScoredMember;
      return { name: d.studentName, githubPct: null, docsPct: sharePct(d.contributionShare), combinedPct: sharePct(d.contributionShare), flags: [...d.flags] };
    }
    const c = m as CombinedScoredMember;
    return {
      name: c.studentName,
      githubPct: sharePct(c.githubContributionShare),
      docsPct: sharePct(c.documentContributionShare),
      combinedPct: sharePct(c.contributionShare),
      flags: [...c.flags],
    };
  });
}

export function evidenceSourceType(sourceType: string | null): EvidenceReportDto["sourceType"] {
  return sourceType === "EDITOR" || sourceType === "COMBINED" ? sourceType : "GITHUB";
}

/**
 * The college name is not on the stored report, so it is left empty (the sheet then omits the line) and the
 * leader name is left blank: the instructor copy never invents either.
 */
export function evidenceDtoFromStored(stored: StoredReportResponse, meta?: ExportClassSource | null): EvidenceReportDto {
  const sourceType = evidenceSourceType(stored.sourceType);
  const members = stored.report.members;
  const blend = stored.scoringConfig?.blend ?? null;
  const classCodes = [meta?.classCode?.trim(), meta?.classSubjectName?.trim()].filter(Boolean).join(" · ");
  return {
    collegeName: "",
    groupName: stored.groupName,
    className: classCodes || exportClassLabel(meta) || "—",
    projectTitle: meta?.assignmentTitle?.trim() || "—",
    repoUrl: sourceType === "EDITOR" ? null : stored.repoUrl,
    analyzedAt: stored.analyzedAt,
    generatedAt: new Date().toISOString(),
    sourceType,
    weights: sourceType === "COMBINED" && blend ? { githubPct: weightPct(blend.wGitHub), docsPct: weightPct(blend.wDocs) } : null,
    memberCount: members.length,
    equalSharePct: equalSharePct(members.length),
    members: evidenceRowsFromStored(members, sourceType),
    leaderName: null,
    reportId: stored.evidenceReportId ?? "",
  };
}

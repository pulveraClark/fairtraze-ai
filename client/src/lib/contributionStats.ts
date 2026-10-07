import type { Flag } from "@shared/types";

// Mirrors the per-source myContribution shapes returned by
// GET /api/student/group/:projectId (server/src/routes/join.ts).

export interface GithubMyContribution {
  contributionShare: number;
  commits:           number;
  additions:         number;
  deletions:         number;
  activeDays:        number;
  flags:             Flag[];
}

export interface EditorMyContribution {
  contributionShare:  number;
  sessionCount:       number;
  activeDays:         number;
  retainedChars:      number;
  totalInsertedChars: number;
  flags:              Flag[];
}

export interface CombinedMyContribution {
  contributionShare:         number;
  githubContributionShare:   number;
  documentContributionShare: number;
  wGitHub:                   number;
  wDocs:                     number;
  flags:                     Flag[];
  github: { commits: number; additions: number; deletions: number; activeDays: number } | null;
  document: { sessionCount: number; activeDays: number; retainedChars: number; totalInsertedChars: number } | null;
}

export type MyContribution = GithubMyContribution | EditorMyContribution | CombinedMyContribution;
export type ContributionSourceType = "GITHUB" | "EDITOR" | "COMBINED";

export interface StatCard { label: string; value: string; }

function fmtInt(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "—";
}

function fmtLocale(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString() : "—";
}

function fmtPct(n: unknown): string {
  return typeof n === "number" && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—";
}

// Stats-card selection for the "Stats grid" below the contribution-share card. Branches
// by source type since GITHUB/EDITOR/COMBINED myContribution payloads have different
// field names (see shapes above). Never reads a field that doesn't exist on the given
// shape, and every formatter falls back to "—" instead of producing "undefined"/NaN.
export function getContributionStatsCards(
  myContribution: MyContribution | null,
  sourceType: ContributionSourceType | string,
): StatCard[] {
  if (!myContribution) return [];

  if (sourceType === "EDITOR") {
    const m = myContribution as EditorMyContribution;
    return [
      { label: "Sessions",             value: fmtInt(m.sessionCount) },
      { label: "Active Days",          value: fmtInt(m.activeDays) },
      { label: "Retained Characters",  value: fmtLocale(m.retainedChars) },
      { label: "Inserted Characters",  value: fmtLocale(m.totalInsertedChars) },
    ];
  }

  if (sourceType === "COMBINED") {
    const m = myContribution as CombinedMyContribution;
    return [
      { label: "GitHub Share", value: fmtPct(m.githubContributionShare) },
      { label: "Docs Share",   value: fmtPct(m.documentContributionShare) },
      { label: "GitHub Weight", value: fmtPct(m.wGitHub) },
      { label: "Docs Weight",   value: fmtPct(m.wDocs) },
    ];
  }

  // GITHUB (default)
  const m = myContribution as GithubMyContribution;
  return [
    { label: "Commits",       value: fmtInt(m.commits) },
    { label: "Active Days",   value: fmtInt(m.activeDays) },
    { label: "Lines Added",   value: fmtLocale(m.additions) },
    { label: "Lines Deleted", value: fmtLocale(m.deletions) },
  ];
}

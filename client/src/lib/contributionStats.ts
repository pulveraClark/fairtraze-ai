import type { Flag } from "@shared/types";

// Mirrors the per-source myContribution shapes returned by
// GET /api/student/group/:projectId (server/src/routes/join.ts).

export interface GithubMyContribution {
  contributionShare: number;
  commits:           number;
  additions:         number;
  deletions:         number;
  activeDays:        number;
  /** Own counting detail for "How this was counted"; optional so older responses still parse. */
  commentLinesAdded?: number;
  blankLinesAdded?:   number;
  flags:             Flag[];
}

export interface EditorMyContribution {
  contributionShare:  number;
  sessionCount:       number;
  activeDays:         number;
  retainedChars:      number;
  totalInsertedChars: number;
  selfChurnRatio?:    number;
  importedRetainedChars?: number;
  insertedImageCount?: number;
  flags:              Flag[];
}

export interface CombinedMyContribution {
  contributionShare:         number;
  githubContributionShare:   number;
  documentContributionShare: number;
  wGitHub:                   number;
  wDocs:                     number;
  flags:                     Flag[];
  github: { commits: number; additions: number; deletions: number; activeDays: number; commentLinesAdded?: number; blankLinesAdded?: number } | null;
  document: {
    sessionCount: number; activeDays: number; retainedChars: number; totalInsertedChars: number;
    selfChurnRatio?: number; importedRetainedChars?: number; insertedImageCount?: number;
  } | null;
}

/** Builds the "How this was counted" input from a student's own contribution. Pure; own data only. */
export function ownCountedInput(mine: MyContribution | null, sourceType: string, rulesVersion: number | null | undefined) {
  if (!mine) return null;
  const base = { voice: "you" as const, rulesVersion: rulesVersion ?? null };
  if (sourceType === "EDITOR") {
    const m = mine as EditorMyContribution;
    return { ...base, github: null, docs: { selfChurnRatio: m.selfChurnRatio, totalInsertedChars: m.totalInsertedChars, retainedChars: m.retainedChars, importedChars: m.importedRetainedChars, images: m.insertedImageCount } };
  }
  if (sourceType === "COMBINED") {
    const m = mine as CombinedMyContribution;
    const d = m.document;
    return {
      ...base,
      github: m.github ? { commentLines: m.github.commentLinesAdded, blankLines: m.github.blankLinesAdded } : null,
      docs: d ? { selfChurnRatio: d.selfChurnRatio, totalInsertedChars: d.totalInsertedChars, retainedChars: d.retainedChars, importedChars: d.importedRetainedChars, images: d.insertedImageCount } : null,
    };
  }
  const m = mine as GithubMyContribution;
  return { ...base, github: { commentLines: m.commentLinesAdded, blankLines: m.blankLinesAdded }, docs: null };
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

/**
 * "Score blend: 50% GitHub / 50% Docs" for a Combined member, or null for any other source. The weights
 * are shown as one quiet line instead of two tiles; they are the project's settings, not the member's.
 */
export function scoreBlendLine(myContribution: MyContribution | null, sourceType: ContributionSourceType | string): string | null {
  if (!myContribution || sourceType !== "COMBINED") return null;
  const m = myContribution as CombinedMyContribution;
  if (typeof m.wGitHub !== "number" || typeof m.wDocs !== "number" || !Number.isFinite(m.wGitHub) || !Number.isFinite(m.wDocs)) return null;
  return `Score blend: ${Math.round(m.wGitHub * 100)}% GitHub / ${Math.round(m.wDocs * 100)}% Docs`;
}

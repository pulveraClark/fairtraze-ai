import type {
  AnyScoredMember,
  CombinedScoredMember,
  DocumentScoredMember,
  MemberRoleInfo,
  ScoredMember,
} from "@shared/types";

export function isCombinedMember(m: AnyScoredMember): m is CombinedScoredMember {
  return "githubContributionShare" in m;
}
export function isDocumentMember(m: AnyScoredMember): m is DocumentScoredMember {
  return "sessionCount" in m;
}
export function isGithubMember(m: AnyScoredMember): m is ScoredMember {
  return "commits" in m;
}

/** GitHub-side stats for a member, or null when the report has none for them. */
export function githubStatsOf(m: AnyScoredMember): ScoredMember | null {
  if (isCombinedMember(m)) return m.github;
  return isGithubMember(m) ? m : null;
}

/** Docs-side stats for a member, or null when the report has none for them. */
export function docsStatsOf(m: AnyScoredMember): DocumentScoredMember | null {
  if (isCombinedMember(m)) return m.document;
  return isDocumentMember(m) ? m : null;
}

/** Same join MemberTable used: userId when the scored member has one, else GitHub username. */
export function roleInfoOf(m: AnyScoredMember, memberRoles: MemberRoleInfo[] | undefined): MemberRoleInfo | undefined {
  if (!memberRoles) return undefined;
  if ("userId" in m) return memberRoles.find((r) => r.userId === m.userId);
  return memberRoles.find((r) => r.githubUsername.toLowerCase() === m.githubUsername.toLowerCase());
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const ROLE_LABEL: Record<string, string> = { DEVELOPER: "Developer", DOCUMENTATION: "Documentation" };

export function formatPct(share: number, digits = 1): string {
  return `${(share * 100).toFixed(digits)}%`;
}

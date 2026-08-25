import type {
  RawMemberStats, ScoredMember, RawDocumentMemberStats, DocumentScoredMember,
  CombinedScoredMember, TeamReport, TeamHealth, BlendWeights, ScoringThresholds, Flag,
} from "./types.js";
import { gini, round3, DEFAULT_THRESHOLDS, HEALTHY_GINI_THRESHOLD, MODERATE_RISK_GINI_THRESHOLD } from "./scoring.js";

export const DEFAULT_BLEND_WEIGHTS: BlendWeights = { wGitHub: 0.5, wDocs: 0.5 };

export interface CombinedRosterMember {
  userId: number;
  studentName: string;
  githubUsername: string;
}

// Blends an already-computed GitHub TeamReport and Docs TeamReport into one combined report for
// COMBINED-sourceType projects. Flags, Gini, and team health are computed exclusively from the
// blended contributionShare — never per-source — so a code-only or docs-only member is never
// wrongly flagged for the source they didn't touch (see FAIRTRAZE_DOCS.md §5).
//
// githubRaw/githubScored and documentRaw/documentScored must each be parallel arrays (same order)
// — the shape computeTeamReport/computeDocumentTeamReport already preserve 1:1 from their inputs.
export function computeCombinedTeamReport(
  roster: CombinedRosterMember[],
  githubRaw: RawMemberStats[],
  githubScored: ScoredMember[],
  documentRaw: RawDocumentMemberStats[],
  documentScored: DocumentScoredMember[],
  blend: BlendWeights = DEFAULT_BLEND_WEIGHTS,
  thresholds: ScoringThresholds = DEFAULT_THRESHOLDS,
  deadline?: number | null
): TeamReport<CombinedScoredMember> {
  if (roster.length === 0) {
    return { members: [], memberCount: 0, gini: 0, teamHealth: "Healthy", deadlineWindowBasis: "activity-span" };
  }

  const memberCount = roster.length;
  const equalShare = 1 / memberCount;

  const githubByUsername = new Map<string, { raw: RawMemberStats; scored: ScoredMember }>();
  githubRaw.forEach((raw, i) => {
    githubByUsername.set(raw.githubUsername.toLowerCase(), { raw, scored: githubScored[i] });
  });

  const documentByUserId = new Map<number, { raw: RawDocumentMemberStats; scored: DocumentScoredMember }>();
  documentRaw.forEach((raw, i) => {
    documentByUserId.set(raw.userId, { raw, scored: documentScored[i] });
  });

  const baseStats = roster.map((r) => {
    const gh  = githubByUsername.get(r.githubUsername.toLowerCase()) ?? null;
    const doc = documentByUserId.get(r.userId) ?? null;

    const githubContributionShare   = gh?.scored.contributionShare ?? 0;
    const documentContributionShare = doc?.scored.contributionShare ?? 0;
    const contributionShare =
      blend.wGitHub * githubContributionShare + blend.wDocs * documentContributionShare;

    const commits      = gh?.scored.commits ?? 0;
    const sessionCount = doc?.scored.sessionCount ?? 0;

    // Unified timeline: GitHub commit timestamps + document session timestamps combined.
    const unifiedTimestamps = [
      ...(gh?.raw.commitDates ?? []),
      ...(doc?.raw.sessionDates ?? []),
    ].map((d) => new Date(d).getTime());

    return { ...r, gh, doc, githubContributionShare, documentContributionShare, contributionShare, commits, sessionCount, unifiedTimestamps };
  });

  // Phase boundary (2/3 point) computed once across ALL members' unified timestamps.
  const allTimestamps = baseStats.flatMap((m) => m.unifiedTimestamps);
  let phaseStart: number | null = null;
  let deadlineWindowBasis: "assignment-deadline" | "activity-span" = "activity-span";
  if (allTimestamps.length > 0) {
    const minTime = Math.min(...allTimestamps);
    if (deadline != null && deadline > minTime) {
      phaseStart = minTime + (2 / 3) * (deadline - minTime);
      deadlineWindowBasis = "assignment-deadline";
    } else {
      const maxTime = Math.max(...allTimestamps);
      const span = maxTime - minTime;
      if (span > 0) phaseStart = minTime + (2 / 3) * span;
    }
  }

  const giniValue = gini(baseStats.map((m) => m.contributionShare));
  const teamHealth: TeamHealth =
    giniValue < HEALTHY_GINI_THRESHOLD
      ? "Healthy"
      : giniValue < MODERATE_RISK_GINI_THRESHOLD
        ? "Moderate Risk"
        : "High Risk";

  const members: CombinedScoredMember[] = baseStats.map((m) => {
    let lastPhaseRatio = 0;
    if (phaseStart !== null && m.unifiedTimestamps.length > 0) {
      const inLastPhase = m.unifiedTimestamps.filter((t) => t >= phaseStart!).length;
      lastPhaseRatio = inLastPhase / m.unifiedTimestamps.length;
    }

    const flags: Flag[] = [];
    const totallyInactive = m.commits === 0 && m.sessionCount === 0;
    if (totallyInactive) {
      flags.push("inactive");
    } else {
      if (m.contributionShare < thresholds.freeRider * equalShare) flags.push("free-rider");
      if (lastPhaseRatio > thresholds.deadlineDriven) flags.push("deadline-driven");
    }
    if (m.contributionShare > thresholds.overload * equalShare) flags.push("overload");

    return {
      studentName: m.studentName,
      userId: m.userId,
      githubUsername: m.githubUsername,
      githubContributionShare: round3(m.githubContributionShare),
      documentContributionShare: round3(m.documentContributionShare),
      wGitHub: blend.wGitHub,
      wDocs: blend.wDocs,
      contributionShare: round3(m.contributionShare),
      lastPhaseRatio: round3(lastPhaseRatio),
      flags,
      github: m.gh?.scored ?? null,
      document: m.doc?.scored ?? null,
    };
  });

  return { members, memberCount, gini: round3(giniValue), teamHealth, deadlineWindowBasis };
}

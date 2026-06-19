import type { RawMemberStats, ScoredMember, TeamReport, TeamHealth, ScoringWeights, Flag } from "./types";

export const DEFAULT_WEIGHTS: ScoringWeights = { commits: 0.4, churn: 0.4, activeDays: 0.2 };

export const FREE_RIDER_THRESHOLD = 0.5;
export const OVERLOAD_THRESHOLD = 1.75;
export const DEADLINE_DRIVEN_THRESHOLD = 0.6;
export const HEALTHY_GINI_THRESHOLD = 0.2;
export const MODERATE_RISK_GINI_THRESHOLD = 0.4;

export function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sum += Math.abs(values[i] - values[j]);
    }
  }
  return sum / (2 * n * total);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeTeamReport(
  rawMembers: RawMemberStats[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): TeamReport {
  if (rawMembers.length === 0) {
    return { members: [], memberCount: 0, gini: 0, teamHealth: "Healthy" };
  }

  const memberCount = rawMembers.length;
  const equalShare = 1 / memberCount;

  const baseStats = rawMembers.map((m) => ({
    ...m,
    churn: m.additions + m.deletions,
    activeDays: new Set(m.commitDates.map((d) => d.slice(0, 10))).size,
  }));

  const totalCommits = baseStats.reduce((s, m) => s + m.commits, 0);
  const totalChurn = baseStats.reduce((s, m) => s + m.churn, 0);
  const totalActiveDays = baseStats.reduce((s, m) => s + m.activeDays, 0);

  // Compute overall timeline boundaries for lastPhaseRatio
  const allTimestamps = rawMembers
    .flatMap((m) => m.commitDates)
    .map((d) => new Date(d).getTime());

  let phaseStart: number | null = null;
  if (allTimestamps.length > 0) {
    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    const span = maxTime - minTime;
    if (span > 0) {
      phaseStart = minTime + (2 / 3) * span;
    }
  }

  const withShares = baseStats.map((m) => {
    const commitShare = totalCommits > 0 ? m.commits / totalCommits : 0;
    const churnShare = totalChurn > 0 ? m.churn / totalChurn : 0;
    const activeDaysShare = totalActiveDays > 0 ? m.activeDays / totalActiveDays : 0;
    const contributionShare =
      weights.commits * commitShare +
      weights.churn * churnShare +
      weights.activeDays * activeDaysShare;

    let lastPhaseRatio = 0;
    if (phaseStart !== null && m.commitDates.length > 0) {
      const timestamps = m.commitDates.map((d) => new Date(d).getTime());
      const inLastPhase = timestamps.filter((t) => t >= phaseStart!).length;
      lastPhaseRatio = inLastPhase / timestamps.length;
    }

    return { ...m, commitShare, churnShare, activeDaysShare, contributionShare, lastPhaseRatio };
  });

  // Compute gini on unrounded contributionShares
  const giniValue = gini(withShares.map((m) => m.contributionShare));

  const teamHealth: TeamHealth =
    giniValue < HEALTHY_GINI_THRESHOLD
      ? "Healthy"
      : giniValue < MODERATE_RISK_GINI_THRESHOLD
        ? "Moderate Risk"
        : "High Risk";

  const members: ScoredMember[] = withShares.map((m) => {
    const flags: Flag[] = [];
    if (m.commits === 0) {
      flags.push("inactive");
    } else {
      if (m.contributionShare < FREE_RIDER_THRESHOLD * equalShare) flags.push("free-rider");
      if (m.lastPhaseRatio > DEADLINE_DRIVEN_THRESHOLD) flags.push("deadline-driven");
    }
    if (m.contributionShare > OVERLOAD_THRESHOLD * equalShare) flags.push("overload");

    return {
      studentName: m.studentName,
      githubUsername: m.githubUsername,
      commits: m.commits,
      additions: m.additions,
      deletions: m.deletions,
      churn: m.churn,
      activeDays: m.activeDays,
      lastPhaseRatio: round3(m.lastPhaseRatio),
      commitShare: round3(m.commitShare),
      churnShare: round3(m.churnShare),
      activeDaysShare: round3(m.activeDaysShare),
      contributionShare: round3(m.contributionShare),
      flags,
    };
  });

  return {
    members,
    memberCount,
    gini: round3(giniValue),
    teamHealth,
  };
}

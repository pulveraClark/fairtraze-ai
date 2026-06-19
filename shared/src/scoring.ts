import type { RawMemberStats, ScoredMember, TeamReport, TeamHealth, ScoringWeights, Flag } from "./types";

export const DEFAULT_WEIGHTS: ScoringWeights = { commits: 0.4, lines: 0.4, activeDays: 0.2 };

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

  const baseStats = rawMembers.map((m) => {
    const codeLinesAdded    = m.codeLinesAdded    ?? 0;
    const commentLinesAdded = m.commentLinesAdded ?? 0;
    const blankLinesAdded   = m.blankLinesAdded   ?? 0;
    const meaningfulLines   = codeLinesAdded + 0.25 * commentLinesAdded;

    // Significance fields — fall back to meaningfulLines when not provided (preserves existing tests)
    const weightedAdditionsRaw = m.weightedAdditions ?? meaningfulLines;
    const selfChurnRatio       = Math.min(1, Math.max(0, m.selfChurnRatio ?? 0));
    const effectiveAdditions   = weightedAdditionsRaw * (1 - 0.5 * selfChurnRatio);
    // Log-scale commits: diminishing returns on raw count, neutralises commit-padding
    const logCommits = Math.log(m.commits + 1);

    const commitImpactBreakdown = m.commitImpactBreakdown ?? { structural: 0, functional: 0, cosmetic: 0, trivial: 0 };
    const fileTypeBreakdown     = m.fileTypeBreakdown     ?? { source: 0, test: 0, docs: 0, style: 0, config: 0, other: 0 };

    return {
      ...m,
      codeLinesAdded,
      commentLinesAdded,
      blankLinesAdded,
      meaningfulLines,
      weightedAdditions: weightedAdditionsRaw,
      selfChurnRatio,
      effectiveAdditions,
      logCommits,
      commitImpactBreakdown,
      fileTypeBreakdown,
      churn: m.additions + m.deletions,
      activeDays: new Set(m.commitDates.map((d) => d.slice(0, 10))).size,
    };
  });

  const totalLogCommits         = baseStats.reduce((s, m) => s + m.logCommits, 0);
  const totalEffectiveAdditions = baseStats.reduce((s, m) => s + m.effectiveAdditions, 0);
  const totalActiveDays         = baseStats.reduce((s, m) => s + m.activeDays, 0);

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
    const commitShare    = totalLogCommits > 0 ? m.logCommits / totalLogCommits : 0;
    const linesShare     = totalEffectiveAdditions > 0 ? m.effectiveAdditions / totalEffectiveAdditions : 0;
    const activeDaysShare = totalActiveDays > 0 ? m.activeDays / totalActiveDays : 0;
    const contributionShare =
      weights.commits * commitShare +
      weights.lines * linesShare +
      weights.activeDays * activeDaysShare;

    let lastPhaseRatio = 0;
    if (phaseStart !== null && m.commitDates.length > 0) {
      const timestamps = m.commitDates.map((d) => new Date(d).getTime());
      const inLastPhase = timestamps.filter((t) => t >= phaseStart!).length;
      lastPhaseRatio = inLastPhase / timestamps.length;
    }

    return { ...m, commitShare, linesShare, activeDaysShare, contributionShare, lastPhaseRatio };
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

    const codeToCommentRatio =
      m.commentLinesAdded > 0
        ? round3(m.codeLinesAdded / m.commentLinesAdded)
        : null;

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
      linesShare: round3(m.linesShare),
      activeDaysShare: round3(m.activeDaysShare),
      contributionShare: round3(m.contributionShare),
      codeLinesAdded: m.codeLinesAdded,
      commentLinesAdded: m.commentLinesAdded,
      blankLinesAdded: m.blankLinesAdded,
      codeToCommentRatio,
      weightedAdditions:     round3(m.weightedAdditions),
      selfChurnRatio:        round3(m.selfChurnRatio),
      commitImpactBreakdown: m.commitImpactBreakdown,
      fileTypeBreakdown:     m.fileTypeBreakdown,
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

import type {
  RawDocumentMemberStats, DocumentScoredMember, TeamReport, TeamHealth,
  DocumentScoringWeights, ScoringThresholds, Flag,
} from "./types";
import { gini, round3, DEFAULT_THRESHOLDS, HEALTHY_GINI_THRESHOLD, MODERATE_RISK_GINI_THRESHOLD } from "./scoring";

export const DOCUMENT_DEFAULT_WEIGHTS: DocumentScoringWeights = {
  retainedText: 0.4, sessions: 0.2, activeDays: 0.4,
};

export function computeDocumentTeamReport(
  rawMembers: RawDocumentMemberStats[],
  weights: DocumentScoringWeights = DOCUMENT_DEFAULT_WEIGHTS,
  thresholds: ScoringThresholds = DEFAULT_THRESHOLDS
): TeamReport<DocumentScoredMember> {
  if (rawMembers.length === 0) {
    return { members: [], memberCount: 0, gini: 0, teamHealth: "Healthy" };
  }

  const memberCount = rawMembers.length;
  const equalShare = 1 / memberCount;

  const baseStats = rawMembers.map((m) => {
    const selfChurnRatio = m.totalInsertedChars > 0
      ? Math.min(1, Math.max(0, m.selfDeletedChars / m.totalInsertedChars))
      : 0;
    // Edit-type weighting (Step 4b) is applied before the self-churn discount, replacing the
    // unweighted retainedChars input from Step 4. Falls back to retainedChars when absent so
    // existing callers/tests without the new field are unaffected.
    const weightedRetainedChars = m.weightedRetainedChars ?? m.retainedChars;
    const effectiveRetainedChars = weightedRetainedChars * (1 - 0.5 * selfChurnRatio);
    const editTypeBreakdown = m.editTypeBreakdown ?? { substantive: 0, revision: 0, formatting: 0, trivial: 0 };
    const logSessions = Math.log(m.sessionCount + 1);
    const activeDays = new Set(m.sessionDates.map((d) => d.slice(0, 10))).size;
    const churn = m.totalInsertedChars + m.totalDeletedChars;
    return { ...m, selfChurnRatio, effectiveRetainedChars, weightedRetainedChars, editTypeBreakdown, logSessions, activeDays, churn };
  });

  const totalLogSessions            = baseStats.reduce((s, m) => s + m.logSessions, 0);
  const totalEffectiveRetainedChars = baseStats.reduce((s, m) => s + m.effectiveRetainedChars, 0);
  const totalActiveDays             = baseStats.reduce((s, m) => s + m.activeDays, 0);

  const allTimestamps = rawMembers.flatMap((m) => m.sessionDates).map((d) => new Date(d).getTime());
  let phaseStart: number | null = null;
  if (allTimestamps.length > 0) {
    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    const span = maxTime - minTime;
    if (span > 0) phaseStart = minTime + (2 / 3) * span;
  }

  const withShares = baseStats.map((m) => {
    const sessionShare      = totalLogSessions > 0 ? m.logSessions / totalLogSessions : 0;
    const retainedTextShare = totalEffectiveRetainedChars > 0 ? m.effectiveRetainedChars / totalEffectiveRetainedChars : 0;
    const activeDaysShare   = totalActiveDays > 0 ? m.activeDays / totalActiveDays : 0;
    const contributionShare =
      weights.retainedText * retainedTextShare +
      weights.sessions     * sessionShare +
      weights.activeDays   * activeDaysShare;

    let lastPhaseRatio = 0;
    if (phaseStart !== null && m.sessionDates.length > 0) {
      const timestamps = m.sessionDates.map((d) => new Date(d).getTime());
      lastPhaseRatio = timestamps.filter((t) => t >= phaseStart!).length / timestamps.length;
    }
    return { ...m, sessionShare, retainedTextShare, activeDaysShare, contributionShare, lastPhaseRatio };
  });

  const giniValue = gini(withShares.map((m) => m.contributionShare));
  const teamHealth: TeamHealth =
    giniValue < HEALTHY_GINI_THRESHOLD ? "Healthy"
    : giniValue < MODERATE_RISK_GINI_THRESHOLD ? "Moderate Risk"
    : "High Risk";

  const members: DocumentScoredMember[] = withShares.map((m) => {
    const flags: Flag[] = [];
    if (m.sessionCount === 0) {
      flags.push("inactive");
    } else {
      if (m.contributionShare < thresholds.freeRider * equalShare) flags.push("free-rider");
      if (m.lastPhaseRatio > thresholds.deadlineDriven) flags.push("deadline-driven");
    }
    if (m.contributionShare > thresholds.overload * equalShare) flags.push("overload");

    return {
      studentName: m.studentName, userId: m.userId, githubUsername: m.githubUsername,
      sessionCount: m.sessionCount, totalInsertedChars: m.totalInsertedChars,
      totalDeletedChars: m.totalDeletedChars, retainedChars: m.retainedChars,
      effectiveRetainedChars: round3(m.effectiveRetainedChars), churn: m.churn,
      activeDays: m.activeDays, lastPhaseRatio: round3(m.lastPhaseRatio),
      sessionShare: round3(m.sessionShare), retainedTextShare: round3(m.retainedTextShare),
      activeDaysShare: round3(m.activeDaysShare), contributionShare: round3(m.contributionShare),
      selfChurnRatio: round3(m.selfChurnRatio), flags,
      weightedRetainedChars: round3(m.weightedRetainedChars),
      editTypeBreakdown: m.editTypeBreakdown,
    };
  });

  return { members, memberCount, gini: round3(giniValue), teamHealth };
}

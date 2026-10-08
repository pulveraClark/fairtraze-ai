import { HEALTHY_GINI_THRESHOLD, MODERATE_RISK_GINI_THRESHOLD } from "@shared/scoring";

// The Gini band boundaries behind the team-health label. They are fixed constants in
// shared/src/scoring.ts — the stored scoringConfig carries weights and flag thresholds only, not
// these — so the hint reads them from the same constants the scorers use.
export function giniBandsText(): string {
  return `Healthy: Gini below ${HEALTHY_GINI_THRESHOLD}. Moderate risk: ${HEALTHY_GINI_THRESHOLD} to below ${MODERATE_RISK_GINI_THRESHOLD}. High risk: ${MODERATE_RISK_GINI_THRESHOLD} or above.`;
}

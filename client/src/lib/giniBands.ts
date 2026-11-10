import { HEALTHY_GINI_THRESHOLD, MODERATE_RISK_GINI_THRESHOLD } from "@shared/scoring";
import type { TeamHealth } from "@shared/types";

// The Gini band boundaries behind the team-health label. They are fixed constants in shared/src/scoring.ts (the
// stored scoringConfig carries weights and flag thresholds only), so the popover reads them from the same constants
// the scorers use. The band a group is in is the code-computed teamHealth label, never recomputed here.

export interface GiniBand { health: TeamHealth; label: string; range: string }

export function giniBands(): GiniBand[] {
  return [
    { health: "Healthy", label: "Healthy", range: `Gini below ${HEALTHY_GINI_THRESHOLD}` },
    { health: "Moderate Risk", label: "Moderate risk", range: `${HEALTHY_GINI_THRESHOLD} to below ${MODERATE_RISK_GINI_THRESHOLD}` },
    { health: "High Risk", label: "High risk", range: `${MODERATE_RISK_GINI_THRESHOLD} or above` },
  ];
}

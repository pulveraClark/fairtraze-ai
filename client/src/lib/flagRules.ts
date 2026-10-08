import type { Flag, ScoringThresholds } from "@shared/types";

// Plain-language statement of each flag's *definition*, built from the same conditions the
// deterministic scorers use (shared/src/scoring.ts, documentScoring.ts, combinedScoring.ts):
//   inactive         → no commits (GitHub) / no sessions (Docs) / neither (Combined)
//   free-rider       → not inactive AND contributionShare <  freeRider × equalShare
//   overload         → contributionShare > overload × equalShare
//   deadline-driven  → not inactive AND lastPhaseRatio > deadlineDriven
// Display only: it never evaluates a flag, it restates the stored rule. When the stored
// thresholds (or, for deadline-driven, the window basis) are missing the rule cannot be stated
// exactly, so this returns null and callers show the flag name alone.

export type FlagSource = "github" | "document" | "combined";
export type DeadlineBasis = "assignment-deadline" | "activity-span";

const pct = (x: number) => `${+(x * 100).toFixed(1)}%`;

export function describeFlagRule(
  flag: Flag,
  thresholds: ScoringThresholds | null | undefined,
  source: FlagSource,
  basis?: DeadlineBasis | null
): string | null {
  switch (flag) {
    case "inactive":
      return source === "github"
        ? "No recorded commits."
        : source === "document"
        ? "No recorded editing sessions."
        : "No recorded commits and no recorded editing sessions.";
    case "free-rider":
      if (!thresholds) return null;
      return `Contribution share is below ${thresholds.freeRider}× the equal share. Not applied to inactive members.`;
    case "overload":
      if (!thresholds) return null;
      return `Contribution share is above ${thresholds.overload}× the equal share.`;
    case "deadline-driven":
      if (!thresholds || !basis) return null;
      return basis === "assignment-deadline"
        ? `More than ${pct(thresholds.deadlineDriven)} of the member's recorded activity falls at or after the point two-thirds of the way from the group's first recorded activity to the assignment deadline. Not applied to inactive members.`
        : `More than ${pct(thresholds.deadlineDriven)} of the member's recorded activity falls at or after the point two-thirds of the way through the group's observed activity span (no deadline set). Not applied to inactive members.`;
  }
}

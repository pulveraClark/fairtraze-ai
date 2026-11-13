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

const trim1 = (x: number) => `${+x.toFixed(1)}`;
const timesWords = (x: number) => (x === 0.5 ? "half of the equal share" : `${x} times the equal share`);

/**
 * Why a member has no share-based flag, in simple words with the project's real numbers, for the
 * instructor: "No flags: share 32.2% is above 25% (half of the equal share) and below 87.5%
 * (1.75 times the equal share)". Restates the stored free-rider / overload thresholds; it never
 * evaluates a flag. Null when the thresholds or the member count are not known.
 */
export function describeNoFlags(
  share: number,
  memberCount: number,
  thresholds: ScoringThresholds | null | undefined
): string | null {
  if (!thresholds || memberCount <= 0) return null;
  const equalPct = 100 / memberCount;
  const low = thresholds.freeRider * equalPct;
  const high = thresholds.overload * equalPct;
  return `No flags: share ${trim1(share * 100)}% is above ${trim1(low)}% (${timesWords(thresholds.freeRider)}) and below ${trim1(high)}% (${timesWords(thresholds.overload)}).`;
}

/** Student and leader wording: words only. The thresholds are never sent to a student. */
export const NO_FLAGS_OWN = "No flags: your share is within the expected range for this group.";
export const NO_FLAGS_PEER = "No flags: this member's share is within the expected range for this group.";

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

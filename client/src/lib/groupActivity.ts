import type { Flag, ProjectSummaryItem, TeamHealth } from "@shared/types";

// Display-only. A group where nobody has any recorded activity has nothing to compare, so a health label
// ("Healthy") or per-member "inactive 0%" pills would claim more than the data says. The stored report,
// scores, flags and Gini are unchanged and still exported; the screens just say so in plain words.

export const NO_ACTIVITY_LABEL = "Not enough activity yet";

/** True when there is at least one share and every share is 0. */
export function noActivityFromShares(shares: ReadonlyArray<number | null | undefined>): boolean {
  return shares.length > 0 && shares.every((s) => !s);
}

/** An analyzed group (from the instructor summary) in which every member's share is 0. */
export function summaryHasNoActivity(item: Pick<ProjectSummaryItem, "isAnalyzed" | "memberShares">): boolean {
  return item.isAnalyzed && noActivityFromShares(item.memberShares.map((m) => m.contributionShare));
}

/** Flags to show/count for a group: none while the whole group has no activity. */
export function visibleFlags(item: Pick<ProjectSummaryItem, "isAnalyzed" | "memberShares" | "flagsPresent">): Flag[] {
  return summaryHasNoActivity(item) ? [] : item.flagsPresent;
}

/** Health to show for an analyzed group, or "no-activity" when it should read as "Not enough activity yet". */
export function presentedHealth(
  item: Pick<ProjectSummaryItem, "isAnalyzed" | "memberShares" | "teamHealth">,
): TeamHealth | "no-activity" | null {
  if (!item.isAnalyzed) return null;
  return summaryHasNoActivity(item) ? "no-activity" : item.teamHealth;
}

/** At risk = analyzed, has activity, and a risk label or a flag. A group with no activity is never at risk. */
export function isAtRiskGroup(
  item: Pick<ProjectSummaryItem, "isAnalyzed" | "memberShares" | "teamHealth" | "flagsPresent">,
): boolean {
  const health = presentedHealth(item);
  if (health === null || health === "no-activity") return false;
  return health === "High Risk" || health === "Moderate Risk" || visibleFlags(item).length > 0;
}

/** How many analyzed groups have no recorded activity. */
export function noActivityCount(items: ReadonlyArray<Pick<ProjectSummaryItem, "isAnalyzed" | "memberShares">>): number {
  return items.filter(summaryHasNoActivity).length;
}

/** The neutral roll-up line, e.g. "2 groups: no activity yet". */
export function noActivityRollupText(count: number): string {
  return `${count} group${count !== 1 ? "s" : ""}: no activity yet`;
}

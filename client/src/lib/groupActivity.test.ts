import { describe, it, expect } from "vitest";
import { noActivityFromShares, summaryHasNoActivity, visibleFlags, presentedHealth, isAtRiskGroup, noActivityCount, noActivityRollupText } from "./groupActivity";

const item = (shares: number[], over: Record<string, unknown> = {}) => ({
  isAnalyzed: true,
  memberShares: shares.map((s, i) => ({ studentName: `M${i}`, contributionShare: s, flags: [] as never[] })),
  flagsPresent: ["inactive"] as ("inactive")[],
  teamHealth: "Healthy" as const,
  ...over,
});

describe("group activity (display only)", () => {
  it("noActivityFromShares needs at least one share and all zeros", () => {
    expect(noActivityFromShares([0, 0, 0])).toBe(true);
    expect(noActivityFromShares([0, 0.1])).toBe(false);
    expect(noActivityFromShares([])).toBe(false);
    expect(noActivityFromShares([null, undefined])).toBe(true);
  });
  it("an all-zero analyzed group shows no flags and no health label", () => {
    expect(summaryHasNoActivity(item([0, 0, 0]))).toBe(true);
    expect(visibleFlags(item([0, 0, 0]))).toEqual([]);
    expect(presentedHealth(item([0, 0, 0]))).toBe("no-activity");
  });
  it("a group with any activity keeps its flags and health exactly as computed", () => {
    expect(visibleFlags(item([0.6, 0.4, 0]))).toEqual(["inactive"]);
    expect(presentedHealth(item([0.6, 0.4, 0]))).toBe("Healthy");
  });
  it("an unanalyzed group is not 'no activity'", () => {
    expect(summaryHasNoActivity(item([0, 0], { isAnalyzed: false }))).toBe(false);
    expect(presentedHealth(item([0, 0], { isAnalyzed: false }))).toBeNull();
  });

  it("a zero-activity group is never at risk, even with a stored risk label or flags", () => {
    expect(isAtRiskGroup(item([0, 0], { teamHealth: "High Risk" }))).toBe(false);
    expect(isAtRiskGroup(item([0.5, 0.5], { teamHealth: "Moderate Risk", flagsPresent: [] }))).toBe(true);
    expect(isAtRiskGroup(item([0.9, 0.1], { teamHealth: "Healthy", flagsPresent: ["free-rider"] }))).toBe(true);
    expect(isAtRiskGroup(item([0.5, 0.5], { teamHealth: "Healthy", flagsPresent: [] }))).toBe(false);
    expect(isAtRiskGroup(item([0, 0], { isAnalyzed: false }))).toBe(false);
  });
  it("counts zero-activity groups and words the roll-up line", () => {
    expect(noActivityCount([item([0, 0]), item([0.5, 0.5]), item([0], { isAnalyzed: false })])).toBe(1);
    expect(noActivityRollupText(1)).toBe("1 group: no activity yet");
    expect(noActivityRollupText(3)).toBe("3 groups: no activity yet");
  });
});

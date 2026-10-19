import { describe, it, expect } from "vitest";
import { noActivityFromShares, summaryHasNoActivity, visibleFlags, presentedHealth } from "./groupActivity";

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
});

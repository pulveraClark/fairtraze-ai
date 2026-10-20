import { describe, it, expect } from "vitest";
import { noActivityFromShares, summaryHasNoActivity, visibleFlags, presentedHealth, isAtRiskGroup, noActivityCount, noActivityRollupText, quietSource, quietSourceText } from "./groupActivity";

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

describe("quietSource (Combined)", () => {
  const m = (gh: number, doc: number, commits = 0, sessions = 0) => ({
    githubContributionShare: gh, documentContributionShare: doc, github: { commits }, document: { sessionCount: sessions },
  });
  it("names the source with no activity while the other has some", () => {
    expect(quietSource([m(0, 0.6, 0, 3), m(0, 0.4, 0, 2)])).toBe("GitHub");
    expect(quietSource([m(0.5, 0, 4, 0), m(0.5, 0, 2, 0)])).toBe("Docs");
  });
  it("is null when both have activity, or when both are quiet (the no-activity card covers that)", () => {
    expect(quietSource([m(0.5, 0.5, 2, 2), m(0.5, 0.5, 1, 1)])).toBeNull();
    expect(quietSource([m(0, 0), m(0, 0)])).toBeNull();
  });
  it("one member with a commit or session keeps that source active even at share 0", () => {
    expect(quietSource([m(0, 0.5, 1, 1), m(0, 0.5, 0, 1)])).toBeNull();
  });
  it("is null for GitHub-only or Editor-only members and for an empty list", () => {
    expect(quietSource([{ contributionShare: 0.5 } as never])).toBeNull();
    expect(quietSource([])).toBeNull();
  });
  it("words it as requested", () => {
    expect(quietSourceText("Docs")).toBe("No Docs activity yet. Shares only cover GitHub so far.");
    expect(quietSourceText("GitHub")).toBe("No GitHub activity yet. Shares only cover Docs so far.");
  });
});

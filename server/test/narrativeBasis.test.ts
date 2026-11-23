import { describe, it, expect } from "vitest";
import { isNarrativeOutdated, narrativeBasisOf } from "../src/lib/narrativeBasis.js";
import { reportPolicy } from "../src/lib/resultsChange.js";

// The case testers saw: bars 32.2 / 67.8, Healthy, Gini 0.178 beside text written for 28 / 72, Moderate Risk, 0.220.
const shares = (a: number, b: number, health = "Healthy", gini = 0.178) => ({
  teamHealth: health, gini, memberCount: 2,
  members: [
    { userId: 1, contributionShare: a, flags: [] as string[] },
    { userId: 2, contributionShare: b, flags: [] as string[] },
  ],
});
const OLD = shares(0.28, 0.72, "Moderate Risk", 0.22);
const NEW = shares(0.322, 0.678);

describe("narrativeBasisOf", () => {
  it("is stable for the same numbers and member order, and changes when a share, the label or Gini moves", () => {
    expect(narrativeBasisOf(NEW)).toBe(narrativeBasisOf({ ...NEW, members: [...NEW.members].reverse() }));
    expect(narrativeBasisOf(NEW)).not.toBe(narrativeBasisOf(OLD));
    expect(narrativeBasisOf(shares(0.322, 0.678))).not.toBe(narrativeBasisOf(shares(0.33, 0.67)));
    expect(narrativeBasisOf(shares(0.322, 0.678))).not.toBe(narrativeBasisOf(shares(0.322, 0.678, "Healthy", 0.19)));
  });
});

describe("isNarrativeOutdated", () => {
  it("flags text written for other numbers, even with no stored flag", () => {
    expect(isNarrativeOutdated({ report: NEW, narrative: "28% / 72%", narrativeBasis: narrativeBasisOf(OLD) })).toBe(true);
  });
  it("is up to date when the numbers match", () => {
    expect(isNarrativeOutdated({ report: NEW, narrative: "text", narrativeBasis: narrativeBasisOf(NEW) })).toBe(false);
  });
  it("keeps the stored flag, and an older text with no recorded basis relies on it", () => {
    expect(isNarrativeOutdated({ report: NEW, narrative: "text", narrativeOutdated: true })).toBe(true);
    expect(isNarrativeOutdated({ report: NEW, narrative: "text" })).toBe(false);
  });
  it("nothing to flag without a narrative", () => {
    expect(isNarrativeOutdated({ report: NEW, narrative: null, narrativeOutdated: true })).toBe(false);
  });
});

describe("reportPolicy marks the carried text for every trigger and carries its basis", () => {
  const prev = { report: OLD, narrativeBasis: narrativeBasisOf(OLD), narrativeInputHash: "h", narrativeAt: "2026-11-01T00:00:00.000Z" };

  it("a MANUAL re-analysis with moved numbers marks it outdated (it did not before)", () => {
    const p = reportPolicy("manual", prev, NEW, "text");
    expect(p.contentExtras.narrativeOutdated).toBe(true);
    expect(p.contentExtras.narrativeBasis).toBe(narrativeBasisOf(OLD));
    expect(p.contentExtras.narrativeInputHash).toBe("h");
    expect(p.contentExtras.narrativeAt).toBe("2026-11-01T00:00:00.000Z");
  });

  it("a score-only move with the same label and flags is caught too", () => {
    const a = shares(0.3, 0.7);
    const b = shares(0.31, 0.69);
    expect(reportPolicy("auto", { report: a, narrativeBasis: narrativeBasisOf(a) }, b, "text").contentExtras.narrativeOutdated).toBe(true);
  });

  it("identical numbers stay up to date; no narrative means nothing carried or flagged", () => {
    const same = reportPolicy("manual", { report: NEW, narrativeBasis: narrativeBasisOf(NEW) }, NEW, "text");
    expect(same.contentExtras.narrativeOutdated).toBeUndefined();
    expect(reportPolicy("manual", prev, NEW, null).contentExtras).toEqual({ trigger: "manual" });
  });

  it("an older text with no recorded basis is marked when the label or flags changed, for any trigger", () => {
    expect(reportPolicy("manual", { report: { teamHealth: "Healthy", members: [] } }, { teamHealth: "High Risk", members: [] }, "text").contentExtras.narrativeOutdated).toBe(true);
  });
});

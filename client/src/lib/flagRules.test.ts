import { describe, it, expect } from "vitest";
import type { RawMemberStats, ScoringThresholds } from "@shared/types";
import {
  computeTeamReport,
  DEFAULT_THRESHOLDS,
  FREE_RIDER_THRESHOLD,
  OVERLOAD_THRESHOLD,
  DEADLINE_DRIVEN_THRESHOLD,
  HEALTHY_GINI_THRESHOLD,
  MODERATE_RISK_GINI_THRESHOLD,
} from "@shared/scoring";
import { describeFlagRule } from "./flagRules";
import { giniBandsText } from "./giniBands";

function raw(name: string, commits: number, adds: number, dates: string[]): RawMemberStats {
  return {
    studentName: name, githubUsername: name, commits, additions: adds, deletions: 0, commitDates: dates,
    codeLinesAdded: adds, commentLinesAdded: 0, blankLinesAdded: 0,
  };
}

const day = (d: number) => `2026-03-${String(d).padStart(2, "0")}T12:00:00Z`;

describe("describeFlagRule", () => {
  it("uses the scoring engine's default threshold values", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ freeRider: FREE_RIDER_THRESHOLD, overload: OVERLOAD_THRESHOLD, deadlineDriven: DEADLINE_DRIVEN_THRESHOLD });
    expect(describeFlagRule("free-rider", DEFAULT_THRESHOLDS, "github")).toContain(`below ${FREE_RIDER_THRESHOLD}× the equal share`);
    expect(describeFlagRule("overload", DEFAULT_THRESHOLDS, "github")).toContain(`above ${OVERLOAD_THRESHOLD}× the equal share`);
    expect(describeFlagRule("deadline-driven", DEFAULT_THRESHOLDS, "github", "activity-span")).toContain(`More than ${DEADLINE_DRIVEN_THRESHOLD * 100}%`);
  });

  it("states custom stored thresholds, and those are the ones the engine actually applies", () => {
    const custom: ScoringThresholds = { freeRider: 0.9, overload: 1.2, deadlineDriven: 0.55 };
    // A: heavy and early; B: medium; C: light but all activity at the very end.
    const members = [
      raw("A", 40, 4000, [day(1), day(2), day(3), day(4), day(5), day(6)]),
      raw("B", 20, 1500, [day(1), day(3), day(5)]),
      raw("C", 3, 100, [day(28), day(29), day(30)]),
      raw("D", 0, 0, []),
    ];
    const report = computeTeamReport(members, undefined, custom);
    const flagsOf = (n: string) => report.members.find((m) => m.studentName === n)!.flags;
    const equal = 1 / report.memberCount;

    // Every flag the engine raised is describable with exactly the stored numbers.
    const seen = new Set<string>();
    for (const m of report.members) {
      for (const f of m.flags) {
        seen.add(f);
        const rule = describeFlagRule(f, custom, "github", report.deadlineWindowBasis)!;
        expect(rule).not.toBeNull();
        if (f === "free-rider") {
          expect(rule).toContain(`${custom.freeRider}×`);
          expect(m.contributionShare).toBeLessThan(custom.freeRider * equal);
        }
        if (f === "overload") {
          expect(rule).toContain(`${custom.overload}×`);
          expect(m.contributionShare).toBeGreaterThan(custom.overload * equal);
        }
        if (f === "deadline-driven") {
          expect(rule).toContain("55%");
          expect(m.lastPhaseRatio).toBeGreaterThan(custom.deadlineDriven);
        }
        if (f === "inactive") expect(m.commits).toBe(0);
      }
    }
    expect(seen.has("inactive")).toBe(true);
    expect(flagsOf("D")).toEqual(["inactive"]);
    expect(seen.has("overload") || seen.has("free-rider") || seen.has("deadline-driven")).toBe(true);
    // Rule text must differ from the defaults, proving it follows the stored config.
    expect(describeFlagRule("free-rider", custom, "github")).not.toContain(`${FREE_RIDER_THRESHOLD}×`);
  });

  it("states the inactive condition for each source", () => {
    expect(describeFlagRule("inactive", null, "github")).toBe("No recorded commits.");
    expect(describeFlagRule("inactive", null, "document")).toBe("No recorded editing sessions.");
    expect(describeFlagRule("inactive", null, "combined")).toContain("no recorded editing sessions");
  });

  it("names the window basis for deadline-driven", () => {
    expect(describeFlagRule("deadline-driven", DEFAULT_THRESHOLDS, "github", "assignment-deadline")).toContain("assignment deadline");
    expect(describeFlagRule("deadline-driven", DEFAULT_THRESHOLDS, "github", "activity-span")).toContain("observed activity span");
  });

  it("returns null (flag name only) when the rule cannot be stated exactly", () => {
    expect(describeFlagRule("free-rider", null, "github")).toBeNull();
    expect(describeFlagRule("overload", undefined, "github")).toBeNull();
    expect(describeFlagRule("deadline-driven", DEFAULT_THRESHOLDS, "github", null)).toBeNull();
    expect(describeFlagRule("deadline-driven", null, "github", "activity-span")).toBeNull();
  });
});

describe("giniBandsText", () => {
  it("reads the Gini boundaries from the scoring constants", () => {
    const t = giniBandsText();
    expect(t).toContain(`below ${HEALTHY_GINI_THRESHOLD}`);
    expect(t).toContain(`${MODERATE_RISK_GINI_THRESHOLD} or above`);
  });
});

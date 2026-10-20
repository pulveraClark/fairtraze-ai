import { describe, it, expect } from "vitest";
import { computeTeamReport } from "@shared/scoring";
import type { RawMemberStats } from "@shared/types";
import { PREVIEW_MEMBERS, PREVIEW_GINI, AI_NARRATIVE_TEXT } from "./LandingPage";

// Feed the landing-page sample through the real scoring code, using only the lines
// signal so each member's contributionShare is exactly the sample percentage.
function raw(pct: number): RawMemberStats {
  return {
    studentName: "x", githubUsername: "x",
    commits: 1, additions: pct, deletions: 0, commitDates: [],
    weightedAdditions: pct,
  } as RawMemberStats;
}

describe("landing page sample report", () => {
  const report = computeTeamReport(
    PREVIEW_MEMBERS.map((m) => raw(m.pct)),
    { commits: 0, lines: 1, activeDays: 0 },
  );

  it("shares add up to 100%", () => {
    expect(PREVIEW_MEMBERS.reduce((s, m) => s + m.pct, 0)).toBe(100);
  });

  it("flags match the real rules", () => {
    const flagsOf = (i: number) => report.members[i].flags;
    expect(flagsOf(0)).toEqual(["overload"]);
    expect(flagsOf(1)).toEqual([]);
    expect(flagsOf(2)).toEqual([]);
    expect(flagsOf(3)).toEqual(["free-rider"]);
    PREVIEW_MEMBERS.forEach((m, i) => {
      expect(m.flag).toBe(report.members[i].flags[0] ?? null);
    });
  });

  it("Gini and health match", () => {
    expect(report.gini).toBeCloseTo(PREVIEW_GINI, 2);
    expect(report.teamHealth).toBe("Moderate Risk");
  });

  it("narrative quotes the sample shares", () => {
    expect(AI_NARRATIVE_TEXT).toContain(`(${PREVIEW_MEMBERS[0].pct}%)`);
    expect(AI_NARRATIVE_TEXT).toContain(`(${PREVIEW_MEMBERS[3].pct}%)`);
  });
});

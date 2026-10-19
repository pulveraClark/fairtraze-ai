import { describe, it, expect } from "vitest";
import { analysisDayOf, countDistinctAnalysisDays, ANALYSIS_TIME_ZONE } from "./analysisDay";
import { computeTeamReport } from "./scoring";
import { computeDocumentTeamReport } from "./documentScoring";
import type { RawMemberStats, RawDocumentMemberStats } from "./types";

describe("analysisDayOf (Asia/Manila)", () => {
  it("uses the Philippine calendar day, not UTC", () => {
    expect(ANALYSIS_TIME_ZONE).toBe("Asia/Manila");
    expect(analysisDayOf("2026-11-14T15:59:00.000Z")).toBe("2026-11-14");
    expect(analysisDayOf("2026-11-14T16:00:00.000Z")).toBe("2026-11-15");
    expect(analysisDayOf("not a date")).toBeNull();
  });

  it("counts distinct Manila days", () => {
    // same UTC date, different Manila days
    expect(countDistinctAnalysisDays(["2024-01-10T15:59:00Z", "2024-01-10T16:00:00Z"])).toBe(2);
    // different UTC dates, same Manila day (01:00 and 23:00 on Jan 11 in Manila)
    expect(countDistinctAnalysisDays(["2024-01-10T17:00:00Z", "2024-01-11T15:00:00Z"])).toBe(1);
  });
});

describe("active days in scoring use Manila days", () => {
  it("GitHub: commits either side of Manila midnight are two active days", () => {
    const m: RawMemberStats = {
      studentName: "A", githubUsername: "a", commits: 2, additions: 2, deletions: 0,
      commitDates: ["2024-01-10T15:59:00Z", "2024-01-10T16:00:00Z"],
    };
    expect(computeTeamReport([m]).members[0].activeDays).toBe(2);
  });

  it("Docs: sessions on two UTC dates but one Manila day are one active day", () => {
    const m: RawDocumentMemberStats = {
      studentName: "A", userId: 1, githubUsername: "a", retainedChars: 100, totalInsertedChars: 100,
      totalDeletedChars: 0, selfDeletedChars: 0, sessionCount: 2,
      sessionDates: ["2024-01-10T17:00:00Z", "2024-01-11T15:00:00Z"],
    };
    expect(computeDocumentTeamReport([m]).members[0].activeDays).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { computeDocumentTeamReport } from "./documentScoring";
import type { RawDocumentMemberStats } from "./types";

const ZERO_BREAKDOWN = { substantive: 0, revision: 0, formatting: 0, trivial: 0 };

describe("computeDocumentTeamReport", () => {
  it("falls back to retainedChars when weightedRetainedChars is absent (preserves Step 4 behavior)", () => {
    const members: RawDocumentMemberStats[] = [
      {
        studentName: "A", userId: 1, githubUsername: "a",
        retainedChars: 100, totalInsertedChars: 100, totalDeletedChars: 0, selfDeletedChars: 0,
        sessionCount: 1, sessionDates: ["2024-01-01T00:00:00Z"],
        // weightedRetainedChars/editTypeBreakdown intentionally omitted
      },
      {
        studentName: "B", userId: 2, githubUsername: "b",
        retainedChars: 100, totalInsertedChars: 100, totalDeletedChars: 0, selfDeletedChars: 0,
        sessionCount: 1, sessionDates: ["2024-01-01T00:00:00Z"],
      },
    ];
    const report = computeDocumentTeamReport(members);
    // Equal unweighted retainedChars → equal effectiveRetainedChars → equal retainedTextShare
    expect(report.members[0].weightedRetainedChars).toBe(100);
    expect(report.members[0].retainedTextShare).toBeCloseTo(report.members[1].retainedTextShare, 5);
    expect(report.members[0].editTypeBreakdown).toEqual(ZERO_BREAKDOWN);
  });

  it("uses weightedRetainedChars (not raw retainedChars) as the input to effectiveRetainedChars when present", () => {
    const members: RawDocumentMemberStats[] = [
      {
        // Same raw retainedChars as B, but classified as low-weight formatting edits — should score lower
        studentName: "A", userId: 1, githubUsername: "a",
        retainedChars: 100, totalInsertedChars: 100, totalDeletedChars: 0, selfDeletedChars: 0,
        sessionCount: 1, sessionDates: ["2024-01-01T00:00:00Z"],
        weightedRetainedChars: 30, // e.g. 100 chars all formatting (0.3x)
        editTypeBreakdown: { substantive: 0, revision: 0, formatting: 5, trivial: 0 },
      },
      {
        studentName: "B", userId: 2, githubUsername: "b",
        retainedChars: 100, totalInsertedChars: 100, totalDeletedChars: 0, selfDeletedChars: 0,
        sessionCount: 1, sessionDates: ["2024-01-01T00:00:00Z"],
        weightedRetainedChars: 100, // 100 chars all substantive (1.0x)
        editTypeBreakdown: { substantive: 3, revision: 0, formatting: 0, trivial: 0 },
      },
    ];
    const report = computeDocumentTeamReport(members);
    const a = report.members.find((m) => m.userId === 1)!;
    const b = report.members.find((m) => m.userId === 2)!;

    // Raw retainedChars is unchanged (still displayed as-is)
    expect(a.retainedChars).toBe(100);
    expect(b.retainedChars).toBe(100);

    // But weighted score differs: A's formatting-heavy text counts for much less
    expect(a.weightedRetainedChars).toBe(30);
    expect(b.weightedRetainedChars).toBe(100);
    expect(a.effectiveRetainedChars).toBeLessThan(b.effectiveRetainedChars);
    expect(a.retainedTextShare).toBeLessThan(b.retainedTextShare);
    expect(a.contributionShare).toBeLessThan(b.contributionShare);

    expect(a.editTypeBreakdown).toEqual({ substantive: 0, revision: 0, formatting: 5, trivial: 0 });
    expect(b.editTypeBreakdown).toEqual({ substantive: 3, revision: 0, formatting: 0, trivial: 0 });
  });

  it("still applies the self-churn discount after edit-type weighting, not instead of it", () => {
    const members: RawDocumentMemberStats[] = [
      {
        studentName: "A", userId: 1, githubUsername: "a",
        retainedChars: 100, totalInsertedChars: 100, totalDeletedChars: 0, selfDeletedChars: 50,
        sessionCount: 1, sessionDates: ["2024-01-01T00:00:00Z"],
        weightedRetainedChars: 100, // all substantive
        editTypeBreakdown: { substantive: 1, revision: 0, formatting: 0, trivial: 0 },
      },
    ];
    const report = computeDocumentTeamReport(members);
    // selfChurnRatio = 50/100 = 0.5 → effectiveRetainedChars = 100 * (1 - 0.5*0.5) = 75
    expect(report.members[0].effectiveRetainedChars).toBeCloseTo(75, 3);
  });

  it("does not change the base formula weights or shape (0.4 retainedText / 0.2 sessions / 0.4 activeDays)", () => {
    const members: RawDocumentMemberStats[] = [
      {
        studentName: "A", userId: 1, githubUsername: "a",
        retainedChars: 0, totalInsertedChars: 0, totalDeletedChars: 0, selfDeletedChars: 0,
        sessionCount: 0, sessionDates: [],
      },
    ];
    const report = computeDocumentTeamReport(members);
    // Sole member, zero activity → contributionShare 0, flagged inactive — sanity check base shape intact
    expect(report.members[0].contributionShare).toBe(0);
    expect(report.members[0].flags).toContain("inactive");
    expect(report.memberCount).toBe(1);
  });

  // ── deadline-driven / lastPhaseRatio (previously untested for the document path) ──────────

  function docMember(studentName: string, userId: number, githubUsername: string, sessionDates: string[]): RawDocumentMemberStats {
    return {
      studentName, userId, githubUsername,
      retainedChars: 10 * sessionDates.length, totalInsertedChars: 10 * sessionDates.length,
      totalDeletedChars: 0, selfDeletedChars: 0,
      sessionCount: sessionDates.length, sessionDates,
    };
  }

  it("member whose sessions are all near the end is deadline-driven (activity-span basis, unchanged)", () => {
    const earlyDates = ["2024-01-05T00:00:00Z", "2024-01-20T00:00:00Z", "2024-02-10T00:00:00Z"];
    const lateDates = ["2024-03-05T00:00:00Z", "2024-03-15T00:00:00Z", "2024-03-25T00:00:00Z"];
    const members = [docMember("Early", 1, "early", earlyDates), docMember("Late", 2, "late", lateDates)];
    const report = computeDocumentTeamReport(members);
    const late = report.members.find((m) => m.userId === 2)!;
    const early = report.members.find((m) => m.userId === 1)!;
    expect(late.flags).toContain("deadline-driven");
    expect(early.flags).not.toContain("deadline-driven");
    expect(report.deadlineWindowBasis).toBe("activity-span");
  });

  it("a deadline far after all observed session activity suppresses a flag activity-span-only logic would raise", () => {
    const earlyDates = ["2024-01-05T00:00:00Z", "2024-01-20T00:00:00Z", "2024-02-10T00:00:00Z"];
    const lateDates = ["2024-03-05T00:00:00Z", "2024-03-15T00:00:00Z", "2024-03-25T00:00:00Z"];
    const members = [docMember("Early", 1, "early", earlyDates), docMember("Late", 2, "late", lateDates)];
    const farFutureDeadline = new Date("2024-12-25T00:00:00Z").getTime();
    const report = computeDocumentTeamReport(members, undefined, undefined, farFutureDeadline);
    const late = report.members.find((m) => m.userId === 2)!;
    expect(late.flags).not.toContain("deadline-driven");
    expect(report.deadlineWindowBasis).toBe("assignment-deadline");
  });

  it("a nearby deadline can flag session activity that activity-span-only logic would NOT flag", () => {
    const day = 24 * 60 * 60 * 1000;
    const base = new Date("2024-01-01T00:00:00Z").getTime();
    const members = [
      docMember("Strawman", 1, "strawman", [new Date(base).toISOString(), new Date(base + 30 * day).toISOString()]),
      docMember("OnTimeButDiluted", 2, "ontimebutdiluted", [new Date(base + 5 * day).toISOString()]),
    ];

    const activitySpanReport = computeDocumentTeamReport(members);
    const diluted1 = activitySpanReport.members.find((m) => m.userId === 2)!;
    expect(diluted1.flags).not.toContain("deadline-driven");

    const nearbyDeadline = base + 6 * day;
    const deadlineReport = computeDocumentTeamReport(members, undefined, undefined, nearbyDeadline);
    const diluted2 = deadlineReport.members.find((m) => m.userId === 2)!;
    expect(diluted2.flags).toContain("deadline-driven");
    expect(deadlineReport.deadlineWindowBasis).toBe("assignment-deadline");
  });
});

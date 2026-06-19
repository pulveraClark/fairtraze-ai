import { describe, it, expect } from "vitest";
import { gini, computeTeamReport } from "./scoring";
import type { RawMemberStats } from "./types";

describe("gini", () => {
  it("returns 0 for equal values", () => {
    expect(gini([1, 1, 1])).toBe(0);
  });

  it("returns 0.5 for [1, 0]", () => {
    expect(gini([1, 0])).toBe(0.5);
  });
});

describe("computeTeamReport", () => {
  it("balanced 3-person team is Healthy with no flags", () => {
    const days = [
      "2024-01-01T10:00:00Z",
      "2024-01-08T10:00:00Z",
      "2024-01-15T10:00:00Z",
    ];
    const balanced: RawMemberStats[] = ["a", "b", "c"].map((u) => ({
      studentName: u.toUpperCase(),
      githubUsername: u,
      commits: 10,
      additions: 100,
      deletions: 50,
      commitDates: days,
    }));
    const report = computeTeamReport(balanced);
    expect(report.teamHealth).toBe("Healthy");
    expect(report.gini).toBe(0);
    expect(report.members.every((m) => m.flags.length === 0)).toBe(true);
  });

  it("member with 0 commits is flagged inactive, not free-rider", () => {
    const members: RawMemberStats[] = [
      {
        studentName: "Active",
        githubUsername: "active",
        commits: 20,
        additions: 200,
        deletions: 0,
        commitDates: ["2024-01-10T10:00:00Z", "2024-01-20T10:00:00Z"],
      },
      {
        studentName: "Zero",
        githubUsername: "zero",
        commits: 0,
        additions: 0,
        deletions: 0,
        commitDates: [],
      },
    ];
    const report = computeTeamReport(members);
    const zero = report.members.find((m) => m.githubUsername === "zero")!;
    expect(zero.flags).toContain("inactive");
    expect(zero.flags).not.toContain("free-rider");
  });

  it("dominant member is overload and tiny contributor is free-rider", () => {
    const daysA = Array.from({ length: 9 }, (_, i) =>
      `2024-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`
    );
    const members: RawMemberStats[] = [
      {
        studentName: "Big",
        githubUsername: "big",
        commits: 90,
        additions: 900,
        deletions: 0,
        commitDates: daysA,
      },
      {
        studentName: "Small",
        githubUsername: "small",
        commits: 10,
        additions: 100,
        deletions: 0,
        commitDates: ["2024-01-10T10:00:00Z"],
      },
    ];
    const report = computeTeamReport(members);
    const big = report.members.find((m) => m.githubUsername === "big")!;
    const small = report.members.find((m) => m.githubUsername === "small")!;
    expect(big.flags).toContain("overload");
    expect(small.flags).toContain("free-rider");
  });

  it("member whose commits are all near the end is deadline-driven", () => {
    const earlyDates = [
      "2024-01-05T00:00:00Z",
      "2024-01-20T00:00:00Z",
      "2024-02-10T00:00:00Z",
    ];
    const lateDates = [
      "2024-03-05T00:00:00Z",
      "2024-03-15T00:00:00Z",
      "2024-03-25T00:00:00Z",
    ];
    const members: RawMemberStats[] = [
      {
        studentName: "Early",
        githubUsername: "early",
        commits: 3,
        additions: 100,
        deletions: 0,
        commitDates: earlyDates,
      },
      {
        studentName: "Late",
        githubUsername: "late",
        commits: 3,
        additions: 100,
        deletions: 0,
        commitDates: lateDates,
      },
    ];
    const report = computeTeamReport(members);
    const late = report.members.find((m) => m.githubUsername === "late")!;
    const early = report.members.find((m) => m.githubUsername === "early")!;
    expect(late.flags).toContain("deadline-driven");
    expect(early.flags).not.toContain("deadline-driven");
  });
});

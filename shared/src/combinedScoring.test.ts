import { describe, it, expect } from "vitest";
import { computeTeamReport } from "./scoring";
import { computeDocumentTeamReport } from "./documentScoring";
import { computeCombinedTeamReport, type CombinedRosterMember } from "./combinedScoring";
import type { RawMemberStats, RawDocumentMemberStats } from "./types";

// Helper: build a minimal RawMemberStats row
function gh(studentName: string, githubUsername: string, opts: Partial<RawMemberStats> = {}): RawMemberStats {
  return {
    studentName, githubUsername,
    commits: 0, additions: 0, deletions: 0, commitDates: [],
    ...opts,
  };
}

// Helper: build a minimal RawDocumentMemberStats row
function doc(studentName: string, userId: number, githubUsername: string, opts: Partial<RawDocumentMemberStats> = {}): RawDocumentMemberStats {
  return {
    studentName, userId, githubUsername,
    retainedChars: 0, totalInsertedChars: 0, totalDeletedChars: 0, selfDeletedChars: 0,
    sessionCount: 0, sessionDates: [],
    ...opts,
  };
}

describe("computeCombinedTeamReport", () => {
  it("gives a clean 50/50 split for a code-only member + docs-only member (FAIRTRAZE_DOCS.md §5 worked example)", () => {
    const roster: CombinedRosterMember[] = [
      { userId: 1, studentName: "Anna", githubUsername: "anna" },
      { userId: 2, studentName: "Ben", githubUsername: "ben" },
    ];
    // Same-day activity for both — isolates this test to share-blending, not timing (a lone
    // early/late timestamp pair would trip deadline-driven on the 2/3-split timeline, which is
    // exercised deliberately in its own test below).
    const githubRaw = [
      gh("Anna", "anna", { commits: 10, codeLinesAdded: 100, commitDates: ["2024-01-01T00:00:00Z"] }),
      gh("Ben", "ben"),
    ];
    const documentRaw = [
      doc("Anna", 1, "anna"),
      doc("Ben", 2, "ben", { sessionCount: 5, retainedChars: 100, totalInsertedChars: 100, sessionDates: ["2024-01-01T00:00:00Z"] }),
    ];
    const githubScored   = computeTeamReport(githubRaw).members;
    const documentScored = computeDocumentTeamReport(documentRaw).members;

    // The default blend is now 0.55 / 0.45: a code-only and a docs-only member get exactly those shares.
    const withDefault = computeCombinedTeamReport(roster, githubRaw, githubScored, documentRaw, documentScored);
    expect(withDefault.members.find((m) => m.userId === 1)!.contributionShare).toBeCloseTo(0.55, 3);
    expect(withDefault.members.find((m) => m.userId === 2)!.contributionShare).toBeCloseTo(0.45, 3);

    const report = computeCombinedTeamReport(
      roster, githubRaw, githubScored, documentRaw, documentScored, { wGitHub: 0.5, wDocs: 0.5 },
    );

    const anna = report.members.find((m) => m.userId === 1)!;
    const ben  = report.members.find((m) => m.userId === 2)!;

    expect(anna.githubContributionShare).toBeCloseTo(1, 3);
    expect(anna.documentContributionShare).toBeCloseTo(0, 3);
    expect(ben.githubContributionShare).toBeCloseTo(0, 3);
    expect(ben.documentContributionShare).toBeCloseTo(1, 3);

    // Neither is penalized to zero for the source they didn't touch — explicit 50/50 blend
    expect(anna.contributionShare).toBeCloseTo(0.5, 3);
    expect(ben.contributionShare).toBeCloseTo(0.5, 3);

    // Neither flagged — a planned, clean division of labour must not read as free-riding
    expect(anna.flags).toEqual([]);
    expect(ben.flags).toEqual([]);
    expect(report.gini).toBeCloseTo(0, 3);
    expect(report.teamHealth).toBe("Healthy");
  });

  it("applies an instructor-configured blend (70/30) without wrongly flagging the smaller contributor", () => {
    const roster: CombinedRosterMember[] = [
      { userId: 1, studentName: "Anna", githubUsername: "anna" },
      { userId: 2, studentName: "Ben", githubUsername: "ben" },
    ];
    const githubRaw = [
      gh("Anna", "anna", { commits: 10, codeLinesAdded: 100, commitDates: ["2024-01-01T00:00:00Z"] }),
      gh("Ben", "ben"),
    ];
    const documentRaw = [
      doc("Anna", 1, "anna"),
      doc("Ben", 2, "ben", { sessionCount: 5, retainedChars: 100, totalInsertedChars: 100, sessionDates: ["2024-01-01T00:00:00Z"] }),
    ];
    const githubScored   = computeTeamReport(githubRaw).members;
    const documentScored = computeDocumentTeamReport(documentRaw).members;

    const report = computeCombinedTeamReport(
      roster, githubRaw, githubScored, documentRaw, documentScored,
      { wGitHub: 0.7, wDocs: 0.3 }
    );

    const anna = report.members.find((m) => m.userId === 1)!;
    const ben  = report.members.find((m) => m.userId === 2)!;

    expect(anna.contributionShare).toBeCloseTo(0.7, 3);
    expect(ben.contributionShare).toBeCloseTo(0.3, 3);
    // equalShare = 0.5; free-rider threshold = 0.5 * 0.5 = 0.25; 0.3 > 0.25 → no flag
    expect(ben.flags).not.toContain("free-rider");
    expect(report.gini).toBeCloseTo(0.2, 2);
  });

  it("flags a member as inactive only when BOTH sources show zero activity", () => {
    const roster: CombinedRosterMember[] = [
      { userId: 1, studentName: "Anna", githubUsername: "anna" },
      { userId: 2, studentName: "Ben", githubUsername: "ben" },
      { userId: 3, studentName: "Carlos", githubUsername: "carlos" },
    ];
    const githubRaw = [
      gh("Anna", "anna", { commits: 10, codeLinesAdded: 100, commitDates: ["2024-01-01T00:00:00Z"] }),
      gh("Ben", "ben"),
      gh("Carlos", "carlos"),
    ];
    const documentRaw = [
      doc("Anna", 1, "anna"),
      doc("Ben", 2, "ben", { sessionCount: 5, retainedChars: 100, totalInsertedChars: 100, sessionDates: ["2024-01-05T00:00:00Z"] }),
      doc("Carlos", 3, "carlos"),
    ];
    const githubScored   = computeTeamReport(githubRaw).members;
    const documentScored = computeDocumentTeamReport(documentRaw).members;

    const report = computeCombinedTeamReport(roster, githubRaw, githubScored, documentRaw, documentScored);

    const anna    = report.members.find((m) => m.userId === 1)!;
    const ben     = report.members.find((m) => m.userId === 2)!;
    const carlos  = report.members.find((m) => m.userId === 3)!;

    // Code-only and docs-only members: not inactive, despite zero activity on one source
    expect(anna.flags).not.toContain("inactive");
    expect(ben.flags).not.toContain("inactive");
    // Genuinely idle on both sources: correctly inactive
    expect(carlos.flags).toContain("inactive");
    expect(carlos.contributionShare).toBe(0);
  });

  it("computes lastPhaseRatio/deadline-driven from the UNIFIED timeline, not either source alone", () => {
    const roster: CombinedRosterMember[] = [
      { userId: 1, studentName: "Anna", githubUsername: "anna" },
      { userId: 2, studentName: "Ben", githubUsername: "ben" },
    ];
    // Anna: one early GitHub commit, then several late document sessions.
    const githubRaw = [
      gh("Anna", "anna", { commits: 1, codeLinesAdded: 20, commitDates: ["2024-01-01T00:00:00Z"] }),
      gh("Ben", "ben", { commits: 1, codeLinesAdded: 20, commitDates: ["2024-01-15T00:00:00Z"] }),
    ];
    const documentRaw = [
      doc("Anna", 1, "anna", {
        sessionCount: 4, retainedChars: 40, totalInsertedChars: 40,
        sessionDates: ["2024-01-26T00:00:00Z", "2024-01-27T00:00:00Z", "2024-01-28T00:00:00Z", "2024-01-29T00:00:00Z"],
      }),
      doc("Ben", 2, "ben"),
    ];
    const githubScored   = computeTeamReport(githubRaw).members;
    const documentScored = computeDocumentTeamReport(documentRaw).members;

    // Sanity: neither source alone would call this deadline-driven for Anna.
    const githubOnlyReport   = computeTeamReport(githubRaw);
    const documentOnlyReport = computeDocumentTeamReport(documentRaw);
    expect(githubOnlyReport.members.find((m) => m.githubUsername === "anna")!.flags).not.toContain("deadline-driven");
    expect(documentOnlyReport.members.find((m) => m.userId === 1)!.flags).not.toContain("deadline-driven");

    const report = computeCombinedTeamReport(roster, githubRaw, githubScored, documentRaw, documentScored);
    const anna = report.members.find((m) => m.userId === 1)!;

    // Unified: [Jan 1, Jan 26, 27, 28, 29] → team span Jan1–Jan29, phase boundary ≈ Jan 19.7 →
    // 4 of Anna's 5 unified timestamps fall in the last phase (0.8 > 0.6 threshold).
    expect(anna.lastPhaseRatio).toBeGreaterThan(0.6);
    expect(anna.flags).toContain("deadline-driven");
    expect(report.deadlineWindowBasis).toBe("activity-span");
  });

  it("anchors the unified-timeline phase boundary to a deadline, suppressing a false positive from a compressed span", () => {
    const roster: CombinedRosterMember[] = [
      { userId: 1, studentName: "Anna", githubUsername: "anna" },
      { userId: 2, studentName: "Ben", githubUsername: "ben" },
    ];
    const githubRaw = [
      gh("Anna", "anna", { commits: 1, codeLinesAdded: 20, commitDates: ["2024-01-01T00:00:00Z"] }),
      gh("Ben", "ben", { commits: 1, codeLinesAdded: 20, commitDates: ["2024-01-15T00:00:00Z"] }),
    ];
    const documentRaw = [
      doc("Anna", 1, "anna", {
        sessionCount: 4, retainedChars: 40, totalInsertedChars: 40,
        sessionDates: ["2024-01-26T00:00:00Z", "2024-01-27T00:00:00Z", "2024-01-28T00:00:00Z", "2024-01-29T00:00:00Z"],
      }),
      doc("Ben", 2, "ben"),
    ];
    const githubScored   = computeTeamReport(githubRaw).members;
    const documentScored = computeDocumentTeamReport(documentRaw).members;

    // A deadline far after all this activity (unlike the activity-span-only version of this test
    // above) should recognize none of it as actually last-minute — Anna's late document sessions
    // happened in late January, months before this deadline.
    const farFutureDeadline = new Date("2024-12-25T00:00:00Z").getTime();
    const report = computeCombinedTeamReport(
      roster, githubRaw, githubScored, documentRaw, documentScored,
      undefined, undefined, farFutureDeadline
    );
    const anna = report.members.find((m) => m.userId === 1)!;

    expect(anna.flags).not.toContain("deadline-driven");
    expect(report.deadlineWindowBasis).toBe("assignment-deadline");
  });

  it("keeps combined shares summing to ~1.0 across a mixed 3-member team", () => {
    const roster: CombinedRosterMember[] = [
      { userId: 1, studentName: "Anna", githubUsername: "anna" },
      { userId: 2, studentName: "Ben", githubUsername: "ben" },
      { userId: 3, studentName: "Carlos", githubUsername: "carlos" },
    ];
    const githubRaw = [
      gh("Anna", "anna", { commits: 10, codeLinesAdded: 200, commitDates: ["2024-01-01T00:00:00Z", "2024-01-02T00:00:00Z"] }),
      gh("Ben", "ben", { commits: 5, codeLinesAdded: 50, commitDates: ["2024-01-03T00:00:00Z"] }),
      gh("Carlos", "carlos"),
    ];
    const documentRaw = [
      doc("Anna", 1, "anna", { sessionCount: 2, retainedChars: 20, totalInsertedChars: 20, sessionDates: ["2024-01-04T00:00:00Z"] }),
      doc("Ben", 2, "ben"),
      doc("Carlos", 3, "carlos", { sessionCount: 8, retainedChars: 300, totalInsertedChars: 300, sessionDates: ["2024-01-06T00:00:00Z"] }),
    ];
    const githubScored   = computeTeamReport(githubRaw).members;
    const documentScored = computeDocumentTeamReport(documentRaw).members;

    const report = computeCombinedTeamReport(roster, githubRaw, githubScored, documentRaw, documentScored);
    const total = report.members.reduce((s, m) => s + m.contributionShare, 0);
    expect(total).toBeCloseTo(1, 2);
    expect(report.memberCount).toBe(3);
  });

  describe("one quiet source", () => {
    const roster3: CombinedRosterMember[] = [
      { userId: 1, studentName: "Anna", githubUsername: "anna" },
      { userId: 2, studentName: "Ben", githubUsername: "ben" },
      { userId: 3, studentName: "Carlos", githubUsername: "carlos" },
    ];
    const ghRows = () => [
      gh("Anna", "anna", { commits: 10, codeLinesAdded: 200, commitDates: ["2024-01-01T12:00:00Z", "2024-01-02T12:00:00Z"] }),
      gh("Ben", "ben", { commits: 5, codeLinesAdded: 100, commitDates: ["2024-01-02T12:00:00Z"] }),
      gh("Carlos", "carlos", { commits: 2, codeLinesAdded: 50, commitDates: ["2024-01-02T12:00:00Z"] }),
    ];
    const docRows = () => [
      doc("Anna", 1, "anna", { sessionCount: 2, retainedChars: 300, totalInsertedChars: 300, sessionDates: ["2024-01-01T12:00:00Z", "2024-01-02T12:00:00Z"] }),
      doc("Ben", 2, "ben", { sessionCount: 1, retainedChars: 200, totalInsertedChars: 200, sessionDates: ["2024-01-02T12:00:00Z"] }),
      doc("Carlos", 3, "carlos", { sessionCount: 1, retainedChars: 100, totalInsertedChars: 100, sessionDates: ["2024-01-02T12:00:00Z"] }),
    ];
    const run = (githubRaw: RawMemberStats[], documentRaw: RawDocumentMemberStats[], blend?: { wGitHub: number; wDocs: number }) =>
      computeCombinedTeamReport(
        roster3, githubRaw, computeTeamReport(githubRaw).members, documentRaw, computeDocumentTeamReport(documentRaw).members, blend,
      );
    const sum = (r: ReturnType<typeof run>) => r.members.reduce((s, m) => s + m.contributionShare, 0);

    it("GitHub-only group: shares sum to 1 and equal the GitHub shares", () => {
      const report = run(ghRows(), roster3.map((r) => doc(r.studentName, r.userId, r.githubUsername)));
      expect(sum(report)).toBeCloseTo(1, 2);
      for (const m of report.members) {
        expect(m.contributionShare).toBeCloseTo(m.githubContributionShare, 3);
        expect(m.wGitHub).toBe(1);
        expect(m.wDocs).toBe(0);
      }
    });

    it("Docs-only group: shares sum to 1 and equal the Docs shares", () => {
      const report = run(roster3.map((r) => gh(r.studentName, r.githubUsername)), docRows());
      expect(sum(report)).toBeCloseTo(1, 2);
      for (const m of report.members) {
        expect(m.contributionShare).toBeCloseTo(m.documentContributionShare, 3);
        expect(m.wGitHub).toBe(0);
        expect(m.wDocs).toBe(1);
      }
    });

    it("custom 70/30 blend with Docs quiet: GitHub still gets weight 1 and shares sum to 1", () => {
      const report = run(ghRows(), roster3.map((r) => doc(r.studentName, r.userId, r.githubUsername)), { wGitHub: 0.7, wDocs: 0.3 });
      expect(sum(report)).toBeCloseTo(1, 2);
      for (const m of report.members) {
        expect(m.wGitHub).toBe(1);
        expect(m.wDocs).toBe(0);
      }
    });

    it("custom 70/30 blend with GitHub quiet: Docs still gets weight 1 and shares sum to 1", () => {
      const report = run(roster3.map((r) => gh(r.studentName, r.githubUsername)), docRows(), { wGitHub: 0.7, wDocs: 0.3 });
      expect(sum(report)).toBeCloseTo(1, 2);
      for (const m of report.members) {
        expect(m.wGitHub).toBe(0);
        expect(m.wDocs).toBe(1);
      }
    });

    it("both sources active: the instructor's blend is kept", () => {
      const report = run(ghRows(), docRows(), { wGitHub: 0.7, wDocs: 0.3 });
      for (const m of report.members) {
        expect(m.wGitHub).toBe(0.7);
        expect(m.wDocs).toBe(0.3);
      }
      expect(sum(report)).toBeCloseTo(1, 2);
    });

    it("both sources quiet: unchanged (default weights, all shares 0)", () => {
      const report = run(
        roster3.map((r) => gh(r.studentName, r.githubUsername)),
        roster3.map((r) => doc(r.studentName, r.userId, r.githubUsername)),
      );
      expect(report.members.every((m) => m.contributionShare === 0)).toBe(true);
      expect(report.members.every((m) => m.wGitHub === 0.55 && m.wDocs === 0.45)).toBe(true);
    });
  });

  it("4 members, GitHub only, no Docs: shares are the GitHub shares and only the lowest member is Low contribution", () => {
    const names = ["Anna", "Ben", "Carlos", "Dana"];
    const roster: CombinedRosterMember[] = names.map((n, i) => ({ userId: i + 1, studentName: n, githubUsername: n.toLowerCase() }));
    const day = (d: number) => `2024-01-0${d}T12:00:00Z`;
    const githubRaw = [
      gh("Anna", "anna", { commits: 100, codeLinesAdded: 400, commitDates: [day(1), day(2), day(3), day(4)] }),
      gh("Ben", "ben", { commits: 60, codeLinesAdded: 300, commitDates: [day(1), day(2), day(3)] }),
      gh("Carlos", "carlos", { commits: 30, codeLinesAdded: 200, commitDates: [day(1), day(2)] }),
      gh("Dana", "dana", { commits: 5, codeLinesAdded: 100, commitDates: [day(1)] }),
    ];
    const documentRaw = roster.map((r) => doc(r.studentName, r.userId, r.githubUsername));
    const githubScored = computeTeamReport(githubRaw).members;
    const report = computeCombinedTeamReport(roster, githubRaw, githubScored, documentRaw, computeDocumentTeamReport(documentRaw).members);

    report.members.forEach((m, i) => expect(m.contributionShare).toBeCloseTo(githubScored[i].contributionShare, 3));
    expect(report.members.reduce((s, m) => s + m.contributionShare, 0)).toBeCloseTo(1, 2);
    // equalShare 0.25: free-rider line 0.125, overload line 0.4375
    expect(report.members.map((m) => m.flags)).toEqual([[], [], [], ["free-rider"]]);
  });

  it("returns the empty-team shape when the roster is empty", () => {
    const report = computeCombinedTeamReport([], [], [], [], []);
    expect(report).toEqual({ members: [], memberCount: 0, gini: 0, teamHealth: "Healthy", deadlineWindowBasis: "activity-span" });
  });
});

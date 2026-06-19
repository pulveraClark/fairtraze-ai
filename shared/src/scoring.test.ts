import { describe, it, expect } from "vitest";
import { gini, computeTeamReport } from "./scoring";
import { classifyAddedLines } from "./lineClassifier";
import type { RawMemberStats } from "./types";

// ── gini ──────────────────────────────────────────────────────────────────────

describe("gini", () => {
  it("returns 0 for equal values", () => {
    expect(gini([1, 1, 1])).toBe(0);
  });

  it("returns 0.5 for [1, 0]", () => {
    expect(gini([1, 0])).toBe(0.5);
  });
});

// ── classifyAddedLines ────────────────────────────────────────────────────────

describe("classifyAddedLines", () => {
  it("classifies TypeScript lines correctly", () => {
    const result = classifyAddedLines("app.ts", [
      "",                      // blank
      "  ",                    // blank (whitespace only)
      "// single-line comment",
      "/* block comment */",
      "const x = 1;",
      "  return true;",
    ]);
    expect(result.blank).toBe(2);
    expect(result.comment).toBe(2);
    expect(result.code).toBe(2);
  });

  it("classifies Python lines using # marker", () => {
    const result = classifyAddedLines("utils.py", [
      "# this is a comment",
      "x = 1",
      "",
    ]);
    expect(result.comment).toBe(1);
    expect(result.code).toBe(1);
    expect(result.blank).toBe(1);
  });

  it("classifies HTML lines using <!-- marker", () => {
    const result = classifyAddedLines("index.html", [
      "<!-- header -->",
      "<div>hello</div>",
    ]);
    expect(result.comment).toBe(1);
    expect(result.code).toBe(1);
  });

  it("classifies SQL lines using -- marker", () => {
    const result = classifyAddedLines("schema.sql", [
      "-- drop table first",
      "DROP TABLE users;",
    ]);
    expect(result.comment).toBe(1);
    expect(result.code).toBe(1);
  });

  it("treats unknown extensions as all-code (no markers)", () => {
    const result = classifyAddedLines("file.xyz", [
      "// this looks like a comment but ext is unknown",
      "actual content",
    ]);
    expect(result.code).toBe(2);
    expect(result.comment).toBe(0);
  });

  it("returns correct totals for mixed input", () => {
    const lines = ["const a = 1;", "// note", "", "const b = 2;", "// note2", "  "];
    const result = classifyAddedLines("main.js", lines);
    expect(result.code).toBe(2);
    expect(result.comment).toBe(2);
    expect(result.blank).toBe(2);
    expect(result.code + result.comment + result.blank).toBe(lines.length);
  });
});

// ── computeTeamReport ─────────────────────────────────────────────────────────

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
        codeLinesAdded: 900,  // 90% of meaningful lines
      },
      {
        studentName: "Small",
        githubUsername: "small",
        commits: 10,
        additions: 100,
        deletions: 0,
        commitDates: ["2024-01-10T10:00:00Z"],
        codeLinesAdded: 100,  // 10% of meaningful lines
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

  it("codeLinesAdded drives linesShare; pure blank lines contribute nothing", () => {
    const date = "2024-01-10T10:00:00Z";
    // Member A: 100 real code lines; Member B: 1000 blank lines only (meaningfulLines = 0)
    const members: RawMemberStats[] = [
      {
        studentName: "Coder",
        githubUsername: "coder",
        commits: 10,
        additions: 100,
        deletions: 0,
        commitDates: [date],
        codeLinesAdded: 100,
        commentLinesAdded: 0,
        blankLinesAdded: 0,
      },
      {
        studentName: "Blanks",
        githubUsername: "blanks",
        commits: 10,
        additions: 1000,
        deletions: 0,
        commitDates: [date],
        codeLinesAdded: 0,
        commentLinesAdded: 0,
        blankLinesAdded: 1000,
      },
    ];
    const report = computeTeamReport(members);
    const coder = report.members.find((m) => m.githubUsername === "coder")!;
    const blanks = report.members.find((m) => m.githubUsername === "blanks")!;
    // Coder has all the meaningful lines; blanks has none
    expect(coder.linesShare).toBe(1);
    expect(blanks.linesShare).toBe(0);
    // codeToCommentRatio: coder has no comments → null; blanks has nothing → null
    expect(coder.codeToCommentRatio).toBeNull();
    expect(blanks.codeToCommentRatio).toBeNull();
  });

  it("codeToCommentRatio is computed correctly when comments exist", () => {
    const date = "2024-01-10T10:00:00Z";
    const members: RawMemberStats[] = [
      {
        studentName: "A",
        githubUsername: "a",
        commits: 5,
        additions: 50,
        deletions: 0,
        commitDates: [date],
        codeLinesAdded: 30,
        commentLinesAdded: 10,
        blankLinesAdded: 5,
      },
      {
        studentName: "B",
        githubUsername: "b",
        commits: 5,
        additions: 50,
        deletions: 0,
        commitDates: [date],
        codeLinesAdded: 20,
        commentLinesAdded: 5,
        blankLinesAdded: 0,
      },
    ];
    const report = computeTeamReport(members);
    const a = report.members.find((m) => m.githubUsername === "a")!;
    const b = report.members.find((m) => m.githubUsername === "b")!;
    expect(a.codeToCommentRatio).toBe(3);   // 30/10
    expect(b.codeToCommentRatio).toBe(4);   // 20/5
  });
});

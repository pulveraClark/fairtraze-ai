import { describe, it, expect } from "vitest";
import { gini, computeTeamReport } from "./scoring";
import { classifyAddedLines } from "./lineClassifier";
import { getFileWeight } from "./fileWeights";
import { classifyCommit } from "./commitClassifier";
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

// ── getFileWeight ─────────────────────────────────────────────────────────────

describe("getFileWeight", () => {
  it("source files get weight 1.0", () => {
    expect(getFileWeight("app.ts")).toBe(1.0);
    expect(getFileWeight("main.py")).toBe(1.0);
  });

  it("test files get weight 0.8", () => {
    expect(getFileWeight("app.test.ts")).toBe(0.8);
    expect(getFileWeight("__tests__/util.ts")).toBe(0.8);
  });

  it("style files get weight 0.7", () => {
    expect(getFileWeight("styles.css")).toBe(0.7);
  });

  it("doc files get weight 0.6", () => {
    expect(getFileWeight("README.md")).toBe(0.6);
  });

  it("generated files get weight 0.0", () => {
    expect(getFileWeight("package-lock.json")).toBe(0.0);
    expect(getFileWeight("dist/bundle.js")).toBe(0.0);
  });

  it("unknown extension gets weight 0.5 (other)", () => {
    expect(getFileWeight("unknown.xyz")).toBe(0.5);
  });
});

// ── classifyCommit ────────────────────────────────────────────────────────────

describe("classifyCommit", () => {
  it("classifies as structural when many files touched", () => {
    expect(classifyCommit({ filesChanged: 6, newFilesCreated: 3, additions: 50, deletions: 10, hasSourceFiles: true })).toBe("structural");
  });

  it("classifies as functional for substantive source-file change", () => {
    expect(classifyCommit({ filesChanged: 1, newFilesCreated: 0, additions: 50, deletions: 10, hasSourceFiles: true })).toBe("functional");
  });

  it("classifies as cosmetic for balanced small non-source edit", () => {
    // ratio 8/9 ≈ 0.89 (within 0.8–1.2), total 17 < 20, no source files
    expect(classifyCommit({ filesChanged: 2, newFilesCreated: 0, additions: 8, deletions: 9, hasSourceFiles: false })).toBe("cosmetic");
  });

  it("classifies as trivial for tiny non-source change", () => {
    // total 4 <= 5, no source files
    expect(classifyCommit({ filesChanged: 1, newFilesCreated: 0, additions: 2, deletions: 2, hasSourceFiles: false })).toBe("trivial");
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

// ── log-scale commit normalization ────────────────────────────────────────────

describe("log-scale commit normalization", () => {
  it("member with 0 commits has commitShare 0", () => {
    const members: RawMemberStats[] = [
      { studentName: "Active", githubUsername: "active", commits: 10, additions: 100, deletions: 0, commitDates: ["2024-01-10T10:00:00Z"] },
      { studentName: "Zero", githubUsername: "zero", commits: 0, additions: 0, deletions: 0, commitDates: [] },
    ];
    const report = computeTeamReport(members);
    const zero = report.members.find((m) => m.githubUsername === "zero")!;
    expect(zero.commitShare).toBe(0);
  });

  it("two members with equal commits have equal commitShare", () => {
    const date = "2024-01-10T10:00:00Z";
    const members: RawMemberStats[] = [
      { studentName: "A", githubUsername: "a", commits: 7, additions: 100, deletions: 0, commitDates: [date] },
      { studentName: "B", githubUsername: "b", commits: 7, additions: 100, deletions: 0, commitDates: [date] },
    ];
    const report = computeTeamReport(members);
    const a = report.members.find((m) => m.githubUsername === "a")!;
    const b = report.members.find((m) => m.githubUsername === "b")!;
    expect(a.commitShare).toBe(b.commitShare);
  });
});

// ── self-churn penalty ────────────────────────────────────────────────────────

describe("self-churn penalty", () => {
  it("selfChurnRatio:0 means effectiveAdditions equals weightedAdditions (via linesShare proportionality)", () => {
    const date = "2024-01-10T10:00:00Z";
    const members: RawMemberStats[] = [
      {
        studentName: "A", githubUsername: "a", commits: 5, additions: 50, deletions: 0, commitDates: [date],
        weightedAdditions: 100, selfChurnRatio: 0,
      },
      {
        studentName: "B", githubUsername: "b", commits: 5, additions: 50, deletions: 0, commitDates: [date],
        weightedAdditions: 100, selfChurnRatio: 0,
      },
    ];
    const report = computeTeamReport(members);
    const a = report.members.find((m) => m.githubUsername === "a")!;
    const b = report.members.find((m) => m.githubUsername === "b")!;
    // Equal weightedAdditions + no churn → equal linesShare
    expect(a.linesShare).toBe(b.linesShare);
    expect(a.selfChurnRatio).toBe(0);
  });

  it("selfChurnRatio:1 cuts effectiveAdditions to 0.5 × weightedAdditions", () => {
    const date = "2024-01-10T10:00:00Z";
    // A: 100 weighted, no churn → effectiveAdditions = 100
    // B: 100 weighted, full churn → effectiveAdditions = 50
    const members: RawMemberStats[] = [
      {
        studentName: "A", githubUsername: "a", commits: 5, additions: 50, deletions: 0, commitDates: [date],
        weightedAdditions: 100, selfChurnRatio: 0,
      },
      {
        studentName: "B", githubUsername: "b", commits: 5, additions: 50, deletions: 0, commitDates: [date],
        weightedAdditions: 100, selfChurnRatio: 1,
      },
    ];
    const report = computeTeamReport(members);
    const a = report.members.find((m) => m.githubUsername === "a")!;
    const b = report.members.find((m) => m.githubUsername === "b")!;
    // A has 100 effective, B has 50 effective → A's linesShare ≈ 0.667, B's ≈ 0.333
    expect(a.linesShare).toBeCloseTo(2 / 3, 2);
    expect(b.linesShare).toBeCloseTo(1 / 3, 2);
    expect(b.selfChurnRatio).toBe(1);
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
    // Use extreme ratio (99:1) because log-scale compresses smaller ratios
    // Big: log(100)/log(2) ≈ 0.87 commitShare → contributionShare ≈ 0.924 > 0.875 (overload ✓)
    // Small: log(2)/log(100) ≈ 0.13 commitShare → contributionShare ≈ 0.076 < 0.25 (free-rider ✓)
    const daysA = Array.from({ length: 9 }, (_, i) =>
      `2024-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`
    );
    const members: RawMemberStats[] = [
      {
        studentName: "Big",
        githubUsername: "big",
        commits: 99,
        additions: 990,
        deletions: 0,
        commitDates: daysA,
        codeLinesAdded: 990,
      },
      {
        studentName: "Small",
        githubUsername: "small",
        commits: 1,
        additions: 10,
        deletions: 0,
        commitDates: ["2024-01-10T10:00:00Z"],
        codeLinesAdded: 10,
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
    expect(coder.linesShare).toBe(1);
    expect(blanks.linesShare).toBe(0);
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

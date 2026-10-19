import { describe, it, expect } from "vitest";
import {
  getContributionStatsCards,
  scoreBlendLine,
  type GithubMyContribution,
  type EditorMyContribution,
  type CombinedMyContribution,
} from "./contributionStats";

function githubContribution(overrides: Partial<GithubMyContribution> = {}): GithubMyContribution {
  return {
    contributionShare: 0.4,
    commits: 12,
    additions: 340,
    deletions: 50,
    activeDays: 5,
    flags: [],
    ...overrides,
  };
}

function editorContribution(overrides: Partial<EditorMyContribution> = {}): EditorMyContribution {
  return {
    contributionShare: 0.35,
    sessionCount: 8,
    activeDays: 4,
    retainedChars: 2200,
    totalInsertedChars: 3100,
    flags: [],
    ...overrides,
  };
}

function combinedContribution(overrides: Partial<CombinedMyContribution> = {}): CombinedMyContribution {
  return {
    contributionShare: 0.45,
    githubContributionShare: 0.6,
    documentContributionShare: 0.3,
    wGitHub: 0.5,
    wDocs: 0.5,
    flags: [],
    github: { commits: 14, additions: 400, deletions: 60, activeDays: 6 },
    document: { sessionCount: 5, activeDays: 3, retainedChars: 1200, totalInsertedChars: 1800 },
    ...overrides,
  };
}

describe("getContributionStatsCards", () => {
  it("returns no cards when myContribution is null (any source type)", () => {
    expect(getContributionStatsCards(null, "GITHUB")).toEqual([]);
    expect(getContributionStatsCards(null, "EDITOR")).toEqual([]);
    expect(getContributionStatsCards(null, "COMBINED")).toEqual([]);
  });

  it("builds the GitHub tiles from commits/additions/deletions/activeDays", () => {
    const cards = getContributionStatsCards(githubContribution(), "GITHUB");
    expect(cards).toEqual([
      { label: "Commits", value: "12" },
      { label: "Active Days", value: "5" },
      { label: "Lines Added", value: "340" },
      { label: "Lines Deleted", value: "50" },
    ]);
  });

  it("builds the Editor tiles from sessionCount/activeDays/retainedChars/totalInsertedChars", () => {
    const cards = getContributionStatsCards(editorContribution(), "EDITOR");
    expect(cards).toEqual([
      { label: "Sessions", value: "8" },
      { label: "Active Days", value: "4" },
      { label: "Retained Characters", value: "2,200" },
      { label: "Inserted Characters", value: "3,100" },
    ]);
  });

  it("builds the Combined tiles from the flat share fields; the weights are no longer tiles (18)", () => {
    const cards = getContributionStatsCards(combinedContribution(), "COMBINED");
    expect(cards).toEqual([
      { label: "GitHub Share", value: "60.0%" },
      { label: "Docs Share", value: "30.0%" },
    ]);
  });

  it("does not throw and still returns correct flat tiles when the Combined member's nested github is null", () => {
    const cards = getContributionStatsCards(combinedContribution({ github: null }), "COMBINED");
    expect(cards).toEqual([
      { label: "GitHub Share", value: "60.0%" },
      { label: "Docs Share", value: "30.0%" },
    ]);
  });

  it("does not throw and still returns correct flat tiles when the Combined member's nested document is null", () => {
    const cards = getContributionStatsCards(combinedContribution({ document: null }), "COMBINED");
    expect(cards).toEqual([
      { label: "GitHub Share", value: "60.0%" },
      { label: "Docs Share", value: "30.0%" },
    ]);
  });

  it("falls back to em-dash rather than NaN/undefined when a numeric field is missing", () => {
    const broken = { ...githubContribution(), commits: undefined as unknown as number };
    const cards = getContributionStatsCards(broken, "GITHUB");
    expect(cards[0]).toEqual({ label: "Commits", value: "—" });
  });
});

describe("scoreBlendLine (18)", () => {
  it("words the project's blend for Combined", () => {
    expect(scoreBlendLine(combinedContribution(), "COMBINED")).toBe("Score blend: 50% GitHub / 50% Docs");
    expect(scoreBlendLine(combinedContribution({ wGitHub: 0.7, wDocs: 0.3 }), "COMBINED")).toBe("Score blend: 70% GitHub / 30% Docs");
  });
  it("is null for single-source projects, a missing report, or missing weights", () => {
    expect(scoreBlendLine(githubContribution(), "GITHUB")).toBeNull();
    expect(scoreBlendLine(editorContribution(), "EDITOR")).toBeNull();
    expect(scoreBlendLine(null, "COMBINED")).toBeNull();
    expect(scoreBlendLine(combinedContribution({ wGitHub: undefined as unknown as number }), "COMBINED")).toBeNull();
  });
});

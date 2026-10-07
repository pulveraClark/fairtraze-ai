import { describe, it, expect } from "vitest";
import {
  getContributionStatsCards,
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

  it("builds the Combined tiles from the flat share/weight fields", () => {
    const cards = getContributionStatsCards(combinedContribution(), "COMBINED");
    expect(cards).toEqual([
      { label: "GitHub Share", value: "60.0%" },
      { label: "Docs Share", value: "30.0%" },
      { label: "GitHub Weight", value: "50.0%" },
      { label: "Docs Weight", value: "50.0%" },
    ]);
  });

  it("does not throw and still returns correct flat tiles when the Combined member's nested github is null", () => {
    const cards = getContributionStatsCards(combinedContribution({ github: null }), "COMBINED");
    expect(cards).toEqual([
      { label: "GitHub Share", value: "60.0%" },
      { label: "Docs Share", value: "30.0%" },
      { label: "GitHub Weight", value: "50.0%" },
      { label: "Docs Weight", value: "50.0%" },
    ]);
  });

  it("does not throw and still returns correct flat tiles when the Combined member's nested document is null", () => {
    const cards = getContributionStatsCards(combinedContribution({ document: null }), "COMBINED");
    expect(cards).toEqual([
      { label: "GitHub Share", value: "60.0%" },
      { label: "Docs Share", value: "30.0%" },
      { label: "GitHub Weight", value: "50.0%" },
      { label: "Docs Weight", value: "50.0%" },
    ]);
  });

  it("falls back to em-dash rather than NaN/undefined when a numeric field is missing", () => {
    const broken = { ...githubContribution(), commits: undefined as unknown as number };
    const cards = getContributionStatsCards(broken, "GITHUB");
    expect(cards[0]).toEqual({ label: "Commits", value: "—" });
  });
});

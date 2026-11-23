import { describe, it, expect } from "vitest";
import { hasNoRecordedActivity, contentHasNoRecordedActivity, quietSource } from "../src/lib/reportActivity.js";

describe("hasNoRecordedActivity", () => {
  it("is true only when every member's share is zero", () => {
    expect(hasNoRecordedActivity([{ contributionShare: 0 }, { contributionShare: 0 }])).toBe(true);
    expect(hasNoRecordedActivity([{ contributionShare: 0 }, { contributionShare: 0.2 }])).toBe(false);
  });
  it("is false for an empty member list", () => {
    expect(hasNoRecordedActivity([])).toBe(false);
  });
  it("reads a stored report's JSON and treats unreadable content as having activity", () => {
    expect(contentHasNoRecordedActivity(JSON.stringify({ members: [{ contributionShare: 0 }] }))).toBe(true);
    expect(contentHasNoRecordedActivity(JSON.stringify({ members: [{ contributionShare: 0.5 }] }))).toBe(false);
    // the shape analyze.ts really stores
    expect(contentHasNoRecordedActivity(JSON.stringify({ report: { members: [{ contributionShare: 0 }] }, narrative: null }))).toBe(true);
    expect(contentHasNoRecordedActivity(JSON.stringify({ report: { members: [{ contributionShare: 0.4 }] } }))).toBe(false);
    expect(contentHasNoRecordedActivity("not json")).toBe(false);
    expect(contentHasNoRecordedActivity(null)).toBe(false);
  });
});

describe("quietSource", () => {
  const m = (gh: number, doc: number, commits = 0, sessions = 0) => ({
    githubContributionShare: gh, documentContributionShare: doc, github: { commits }, document: { sessionCount: sessions },
  });
  it("names the quiet source of a Combined report", () => {
    expect(quietSource([m(0, 0.6, 0, 3), m(0, 0.4, 0, 2)])).toBe("GitHub");
    expect(quietSource([m(0.5, 0, 4, 0), m(0.5, 0, 2, 0)])).toBe("Docs");
  });
  it("is null when both or neither are quiet, or the report is not Combined", () => {
    expect(quietSource([m(0, 0), m(0, 0)])).toBeNull();
    expect(quietSource([m(0.5, 0.5, 1, 1)])).toBeNull();
    expect(quietSource([{ contributionShare: 0.2 } as never])).toBeNull();
    expect(quietSource([])).toBeNull();
  });
});

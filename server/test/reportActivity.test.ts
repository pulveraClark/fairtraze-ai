import { describe, it, expect } from "vitest";
import { hasNoRecordedActivity, contentHasNoRecordedActivity } from "../src/lib/reportActivity.js";

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
    expect(contentHasNoRecordedActivity("not json")).toBe(false);
    expect(contentHasNoRecordedActivity(null)).toBe(false);
  });
});

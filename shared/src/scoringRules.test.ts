import { describe, it, expect } from "vitest";
import { SCORING_RULES_VERSION, isRulesOutdated } from "./scoringRules";

describe("isRulesOutdated", () => {
  it("is outdated when the stored report has no version (scored before version 2)", () => {
    expect(isRulesOutdated({})).toBe(true);
  });
  it("is outdated for any older version and current for the current one", () => {
    expect(isRulesOutdated({ scoringRulesVersion: 1 })).toBe(true);
    expect(isRulesOutdated({ scoringRulesVersion: SCORING_RULES_VERSION })).toBe(false);
  });
  it("is not outdated when there is no stored report at all", () => {
    expect(isRulesOutdated(null)).toBe(false);
  });
});

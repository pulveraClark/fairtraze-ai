import { describe, it, expect } from "vitest";
import { isMarkable } from "./requirementMarkable";

describe("isMarkable", () => {
  it("accepts what the AI did not confirm", () => {
    expect(isMarkable({ status: "NOT_FOUND", unverified: true })).toBe(true);
    expect(isMarkable({ status: "NOT_FOUND", unverified: false })).toBe(true);
    expect(isMarkable({ status: "NOT_FOUND" })).toBe(true);
    expect(isMarkable({ status: "PARTLY_FOUND", unverified: false })).toBe(true);
    expect(isMarkable({ status: "FOUND", unverified: true })).toBe(true);
  });
  it("refuses an item the AI marked covered", () => {
    expect(isMarkable({ status: "FOUND", unverified: false })).toBe(false);
    expect(isMarkable({ status: "FOUND" })).toBe(false);
  });
});

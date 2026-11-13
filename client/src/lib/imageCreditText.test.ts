import { describe, it, expect } from "vitest";
import { instructorImageLine } from "./imageCreditText";

describe("instructorImageLine", () => {
  it("reads 'X counted of Y added' with no thresholds", () => {
    expect(instructorImageLine(3, 2)).toBe("2 counted of 3 added");
    expect(instructorImageLine(5, 5)).toBe("5 counted of 5 added");
    expect(instructorImageLine(4, 0)).toBe("0 counted of 4 added");
  });
  it("never shows counted above added", () => {
    expect(instructorImageLine(1, 2)).toBe("2 counted of 2 added");
  });
  it("says nothing when there are no images", () => {
    expect(instructorImageLine(0, 0)).toBeNull();
    expect(instructorImageLine(0, undefined)).toBeNull();
  });
  it("older reports (no counted number) keep the plain inserted wording", () => {
    expect(instructorImageLine(1, undefined)).toBe("1 image inserted");
    expect(instructorImageLine(2, null)).toBe("2 images inserted");
  });
});

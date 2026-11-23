import { describe, it, expect } from "vitest";
import { fitsOnePage, pageLabel, sheetDensity } from "./evidenceLayout";

describe("evidence sheet layout", () => {
  it("is compact above 8 members", () => {
    expect(sheetDensity(8)).toBe("normal");
    expect(sheetDensity(9)).toBe("compact");
  });
  it("single sheet: of Y only when it is known to fit one page", () => {
    expect(pageLabel(5)).toBe("Page 1 of 1");
    expect(pageLabel(16)).toBe("Page 1 of 1");
    expect(fitsOnePage(17)).toBe(false);
    expect(pageLabel(17)).toBe("Page 1");
  });
  it("bulk: Page i of N while every sheet is one page, nothing when one may flow", () => {
    expect(pageLabel(4, { index: 2, count: 3, allFitOnePage: true })).toBe("Page 2 of 3");
    expect(pageLabel(4, { index: 2, count: 3, allFitOnePage: false })).toBe("");
  });
});

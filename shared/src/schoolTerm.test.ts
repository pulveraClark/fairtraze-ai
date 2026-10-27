import { describe, it, expect } from "vitest";
import { termOf, isValidSchoolYear, termLabel } from "./schoolTerm";

describe("termOf (Asia/Manila)", () => {
  it("Aug-Dec is the 1st semester of the school year that starts that year", () => {
    expect(termOf("2026-10-27T04:00:00Z")).toEqual({ schoolYear: "2026-2027", semester: "FIRST" });
    expect(termOf("2026-08-01T00:00:00+08:00")).toEqual({ schoolYear: "2026-2027", semester: "FIRST" });
    expect(termOf("2026-12-31T12:00:00+08:00")).toEqual({ schoolYear: "2026-2027", semester: "FIRST" });
  });
  it("Jan-May is the 2nd semester and Jun-Jul is Summer of the year that began last August", () => {
    expect(termOf("2027-01-01T00:00:00+08:00")).toEqual({ schoolYear: "2026-2027", semester: "SECOND" });
    expect(termOf("2027-05-31T23:00:00+08:00")).toEqual({ schoolYear: "2026-2027", semester: "SECOND" });
    expect(termOf("2027-06-01T00:00:00+08:00")).toEqual({ schoolYear: "2026-2027", semester: "SUMMER" });
    expect(termOf("2027-07-31T23:00:00+08:00")).toEqual({ schoolYear: "2026-2027", semester: "SUMMER" });
  });
  it("uses Manila time at a month edge (UTC is still July, Manila is already August)", () => {
    expect(termOf("2026-07-31T17:00:00Z")).toEqual({ schoolYear: "2026-2027", semester: "FIRST" });
    expect(termOf("2026-07-31T15:00:00Z")).toEqual({ schoolYear: "2025-2026", semester: "SUMMER" });
  });
});

describe("school year helpers", () => {
  it("accepts only consecutive years", () => {
    expect(isValidSchoolYear("2026-2027")).toBe(true);
    expect(isValidSchoolYear("2026-2028")).toBe(false);
    expect(isValidSchoolYear("26-27")).toBe(false);
  });
  it("labels a term", () => {
    expect(termLabel({ schoolYear: "2026-2027", semester: "FIRST" })).toBe("2026-2027, 1st semester");
  });
});

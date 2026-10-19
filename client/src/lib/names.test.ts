import { describe, it, expect } from "vitest";
import { shortMemberNames } from "./names";

describe("shortMemberNames", () => {
  it("uses first name and last initial", () => {
    expect(shortMemberNames(["Klent Sama", "John Christian Lenizo", "Aldren Baricuatro"])).toEqual(["Klent S.", "John L.", "Aldren B."]);
  });
  it("tells apart people who share a first name and prefix (the 'UXA' case)", () => {
    expect(shortMemberNames(["UXA Leader", "UXA Member One", "UXA Member Two"])).toEqual(["UXA L.", "UXA O.", "UXA T."]);
  });
  it("falls back to the full name when two short labels collide", () => {
    expect(shortMemberNames(["Ana Reyes", "Ana Ramos", "Ben Cruz"])).toEqual(["Ana Reyes", "Ana Ramos", "Ben C."]);
  });
  it("numbers identical full names and keeps single-word and blank names", () => {
    expect(shortMemberNames(["Sam Lee", "Sam Lee"])).toEqual(["Sam Lee", "Sam Lee (2)"]);
    expect(shortMemberNames(["Madonna", "  ", "  jo   kim "])).toEqual(["Madonna", "", "jo K."]);
  });
  it("returns an empty list for no members", () => {
    expect(shortMemberNames([])).toEqual([]);
  });
});

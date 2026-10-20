import { describe, it, expect } from "vitest";
import { matches, normalize, queryWords, findRanges, highlightTerms } from "./helpSearch";
import { HELP_FAQ } from "./helpFaq";

describe("helpSearch", () => {
  it("normalizes case, hyphens and punctuation", () => {
    expect(normalize("  Free-Rider!  ")).toBe("free rider");
    expect(queryWords("free   rider")).toEqual(["free", "rider"]);
  });

  it("matches simple word variants and ignores case", () => {
    expect(matches("The free-rider flag", "free rider")).toBe(true);
    expect(matches("The free rider flag", "FREE-RIDER")).toBe(true);
    expect(matches("Flags explained", "tasks")).toBe(false);
  });

  it("requires every word and matches everything for an empty query", () => {
    expect(matches("flags and shares", "flags shares")).toBe(true);
    expect(matches("flags only", "flags shares")).toBe(false);
    expect(matches("anything", "  ")).toBe(true);
  });

  it("maps staff wording to the student wording", () => {
    expect(matches("Low contribution: your share is under half", "free rider")).toBe(true);
    expect(matches("Low contribution: your share is under half", "free-rider")).toBe(true);
    expect(matches("Low contribution", "Inactive")).toBe(true);
    expect(matches("How evenly work is shared in your group", "gini")).toBe(true);
    expect(matches("How evenly work is shared in your group", "inequality")).toBe(true);
    expect(matches("Add a note to a flag", "dispute")).toBe(true);
    expect(matches("Add a note to a flag", "free rider")).toBe(false);
    expect(matches("Add a note", "disputed")).toBe(false);
  });

  it("highlights the student wording of a synonym", () => {
    expect(highlightTerms("gini")).toEqual(["gini", "how evenly work is shared"]);
    expect(highlightTerms("flags")).toEqual(["flags"]);
  });

  it("finds highlight ranges per word", () => {
    expect(findRanges("Free-rider and FREE", ["free", "rider"])).toEqual([[0, 4], [5, 10], [15, 19]]);
  });
});

describe("HELP_FAQ", () => {
  it("has unique ids and short answers, and never mentions Gini", () => {
    expect(new Set(HELP_FAQ.map((f) => f.id)).size).toBe(HELP_FAQ.length);
    for (const f of HELP_FAQ) {
      expect(f.a.split(/(?<=[.!?])\s/).length, f.id).toBeLessThanOrEqual(4);
      expect(`${f.q} ${f.a}`, f.id).not.toMatch(/gini/i);
    }
  });

  it("answers the images question with current behaviour only", () => {
    const a = HELP_FAQ.find((f) => f.id === "faq-images")!.a;
    expect(a).not.toMatch(/planned|future|will|soon/i);
  });
});

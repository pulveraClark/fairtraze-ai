import { describe, it, expect } from "vitest";
import { matches, normalize, queryWords, findRanges } from "./helpSearch";
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

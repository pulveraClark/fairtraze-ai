import { describe, it, expect, vi, afterEach } from "vitest";
import { countLongSentences, logReadability, splitSentences } from "./readability.js";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("readability counter", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("splits into sentences without breaking file names, versions or line items", () => {
    expect(splitSentences("Fixed a bug in route.ts. Added version 2.0 to the page! Why? Done.")).toEqual([
      "Fixed a bug in route.ts.", "Added version 2.0 to the page!", "Why?", "Done.",
    ]);
    expect(splitSentences("First line\nSecond line. Third.")).toEqual(["First line", "Second line.", "Third."]);
    expect(splitSentences("  \n ... \n")).toEqual([]);
  });

  it("counts sentences over 25 words; exactly 25 is fine", () => {
    const texts = [`${words(25)}. ${words(26)}.`, `Short one. ${words(40)}`];
    expect(countLongSentences(texts)).toEqual({ sentences: 4, long: 2 });
    expect(countLongSentences([`${words(25)}.`])).toEqual({ sentences: 1, long: 0 });
    expect(countLongSentences([`${words(10)}.`], 5)).toEqual({ sentences: 1, long: 1 });
  });

  it("counts nothing for no text", () => {
    expect(countLongSentences([])).toEqual({ sentences: 0, long: 0 });
    expect(countLongSentences([""])).toEqual({ sentences: 0, long: 0 });
  });

  it("logs one line with the counts, returns them, and logs nothing when there is no text", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const count = logReadability("member findings (group 3)", [`Short. ${words(30)}.`]);
    expect(count).toEqual({ sentences: 2, long: 1 });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]![0]).toBe("[ai-review] readability member findings (group 3): 1 of 2 sentences have more than 25 words");
    logReadability("x", []);
    expect(info).toHaveBeenCalledTimes(1);
  });

  it("never throws or changes its input", () => {
    const texts = ["A sentence."];
    expect(() => logReadability("x", texts)).not.toThrow();
    expect(texts).toEqual(["A sentence."]);
  });
});

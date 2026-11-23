import { describe, it, expect } from "vitest";
import { findQuoteRange, indexOfQuote, normalizeInstructions, normalizeQuote } from "./quoteMatch.js";

const INSTRUCTIONS = [
  "# Project instructions",
  "",
  "- The app must have a login page.",
  "* Members can’t see each other’s scores — only their own.",
  "1. Students write a **survey report** about `login` habits.",
  "2) Submit a “final” demo by Friday.",
  "> Keep the repo public.",
].join("\n");

const matches = (quote: string) => indexOfQuote(normalizeInstructions(INSTRUCTIONS), normalizeQuote(quote)) !== -1;

describe("normalizeQuote / normalizeInstructions", () => {
  it("ignores case, spacing, curly vs straight quotes and dash types", () => {
    expect(matches("THE APP   must have a LOGIN page")).toBe(true);
    expect(matches("Members can't see each other's scores - only their own")).toBe(true);
    expect(matches("Members can’t see each other’s scores – only their own.")).toBe(true);
    expect(matches('Submit a "final" demo by Friday.')).toBe(true);
  });

  it("ignores list and heading markers, bold, italics asterisks and backticks", () => {
    expect(matches("- The app must have a login page.")).toBe(true);
    expect(matches("• The app must have a login page")).toBe(true);
    expect(matches("1. The app must have a login page.")).toBe(true);
    expect(matches("3) The app must have a login page.")).toBe(true);
    expect(matches("# Project instructions")).toBe(true);
    expect(matches("Students write a survey report about login habits.")).toBe(true);
    expect(matches("Students write a **survey report** about `login` habits.")).toBe(true);
    expect(matches("> Keep the repo public.")).toBe(true);
  });

  it("matches across a line break and across list markers", () => {
    expect(matches("login page. Members can't see each other's scores")).toBe(true);
  });

  it("drops trailing punctuation from the quote", () => {
    expect(normalizeQuote("Keep the repo public!!…")).toBe("keep the repo public");
    expect(normalizeQuote('Submit a "final" demo by Friday."')).toBe('submit a "final" demo by friday');
  });

  it("stays strict about the words: one changed, added or missing word does not match", () => {
    expect(matches("The app must have a signup page.")).toBe(false);
    expect(matches("The app must have a login page now.")).toBe(false);
    expect(matches("The app must have login page.")).toBe(false);
    expect(matches("Students write a survey report about login habit.")).toBe(false);
  });

  it("matches whole words only; a cut-short last word is allowed only when asked for", () => {
    const text = normalizeInstructions("The app has a login habits page.");
    expect(indexOfQuote(text, "login habit")).toBe(-1);
    expect(indexOfQuote(text, "ogin habits")).toBe(-1);
    expect(indexOfQuote(text, "login habit", true)).toBeGreaterThan(-1);
    expect(indexOfQuote(text, "login habits")).toBeGreaterThan(-1);
  });

  it("does not turn a dash inside a word or a number into a list marker", () => {
    expect(normalizeInstructions("Use well-known tools -fast")).toBe("use well-known tools -fast");
    expect(normalizeInstructions("Version 2.0 ships")).toBe("version 2.0 ships");
  });
});

describe("findQuoteRange", () => {
  it("returns offsets in the ORIGINAL text, markers and markdown included in between", () => {
    const quote = "Students write a survey report about login habits.";
    const r = findQuoteRange(INSTRUCTIONS, quote)!;
    expect(INSTRUCTIONS.slice(r.start, r.end)).toBe("Students write a **survey report** about `login` habits");
  });

  it("finds a quote whose list marker and quotes differ from the original", () => {
    const r = findQuoteRange(INSTRUCTIONS, "- Members can't see each other's scores - only their own.")!;
    expect(INSTRUCTIONS.slice(r.start, r.end)).toBe("Members can’t see each other’s scores — only their own");
  });

  it("works with Windows line breaks and repeated lines", () => {
    const text = "Do it.\r\nUse React for the page.\r\nUse React for the page.";
    const r = findQuoteRange(text, "use react for the page")!;
    expect(r).toEqual({ start: 8, end: 30 });
  });

  it("is null when the quote is not there (or empty)", () => {
    expect(findQuoteRange(INSTRUCTIONS, "The app must have a signup page.")).toBeNull();
    expect(findQuoteRange(INSTRUCTIONS, "   ")).toBeNull();
    expect(findQuoteRange("", "anything at all")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { verifyRequirements, type BriefVerifyContext } from "./briefEvidence.js";
import type { RawRequirement } from "./prompts.js";
import type { DocPiece } from "./docsEvidence.js";

const piece = (start: number, text: string, heading: string | null, isHeading = false): DocPiece => ({
  start, end: start + text.length, text, heading, isHeading,
});

// Two paragraphs under "GUI Overview", written by different people, and one list item under "Testing".
const P1 = "The interface is built with Tkinter.";
const P2 = "It has two screens.";
const ctx = (): BriefVerifyContext => ({
  source: { instructions: "Use a Tkinter GUI.", files: [] },
  paths: new Set(),
  fileText: new Map(),
  docs: [{ heading: "GUI Overview", text: `${P1}\n${P2}` }, { heading: "Testing", text: "" }],
  pieces: [
    piece(0, "GUI Overview", "GUI Overview", true),
    piece(12, P1, "GUI Overview"),
    piece(12 + P1.length, P2, "GUI Overview"),
    piece(100, "Testing", "Testing", true),
    piece(107, "Both screens open without errors", "Testing"),
  ],
  spans: [{ userId: 7, start: 12, end: 12 + P1.length }, { userId: 9, start: 12 + P1.length, end: 12 + P1.length + P2.length }],
});
const run = (ref: string, quote: string) =>
  verifyRequirements([
    { text: "Use a Tkinter GUI.", status: "FOUND", sourceQuote: "Use a Tkinter GUI.", evidence: [{ type: "doc", ref, quote }] } as RawRequirement,
  ], ctx()).requirements[0]!;

describe("Docs proof: the cited section is searched as one text", () => {
  it("accepts a quote that runs across two paragraphs of the section, crediting both writers", () => {
    const r = run("GUI Overview", "built with Tkinter. It has two screens");
    expect(r.status).toBe("FOUND");
    expect(r.evidence[0]).toMatchObject({ type: "doc", ref: "GUI Overview" });
    expect([...(r.evidence[0] as { authors: number[] }).authors].sort()).toEqual([7, 9]);
  });

  it("credits only the piece a one-paragraph quote overlaps", () => {
    expect((run("GUI Overview", "It has two screens").evidence[0] as { authors: number[] }).authors).toEqual([9]);
  });

  it("does not join across two different sections", () => {
    expect(run("GUI Overview", "two screens. Testing Both screens open")).toMatchObject({ status: "NOT_FOUND", unverified: true });
  });

  it("falls back to the whole document when the ref is wrong, and re-anchors", () => {
    const r = run("Invented", "Both screens open without errors");
    expect(r.status).toBe("FOUND");
    expect(r.evidence[0]).toMatchObject({ ref: "Testing" });
  });

  it("keeps the 8-character minimum and the whole-heading shortcut", () => {
    expect(run("GUI Overview", "screens")).toMatchObject({ status: "NOT_FOUND", unverified: true });
    expect(run("Testing", "testing").evidence[0]).toMatchObject({ heading: true, ref: "Testing" });
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { logProofCheck, verifyRequirements, type BriefVerifyContext } from "./briefEvidence.js";
import type { RawRequirement } from "./prompts.js";
import type { DocPiece } from "./docsEvidence.js";

const piece = (start: number, text: string, heading: string | null, isHeading = false): DocPiece => ({
  start, end: start + text.length, text, heading, isHeading,
});

const TITLE = "Route Finder: System Documentation";
const ctx = (): BriefVerifyContext => ({
  source: { instructions: "Write system documentation. Add tests. Build a GUI.", files: [] },
  paths: new Set(),
  fileText: new Map(),
  // What the prompt carried: body text only, shortened. The proof check must not depend on it.
  docs: [
    { heading: TITLE, text: "" },
    { heading: "GUI Overview", text: "The interface is built with Tkinter." },
    { heading: "Testing", text: "" },
  ],
  pieces: [
    piece(0, TITLE, TITLE, true),
    piece(34, "GUI Overview", "GUI Overview", true),
    piece(46, "The interface is built with Tkinter.", "GUI Overview"),
    piece(81, "Testing", "Testing", true),
    piece(88, "Login screen loads in two seconds", "Testing"),
    piece(121, "Figure 3: Route map of Cebu City", "Testing"),
  ],
  spans: [{ userId: 7, start: 0, end: 160 }],
});

const req = (evidence: RawRequirement["evidence"], status: RawRequirement["status"] = "FOUND"): RawRequirement => ({
  text: "Has system documentation", status, evidence, sourceQuote: "Write system documentation.",
});
const run = (ref: string, quote: string) => verifyRequirements([req([{ type: "doc", ref, quote }])], ctx()).requirements[0]!;

describe("Docs proof: a quote found anywhere in the real document", () => {
  it("accepts a title-only quote", () => {
    const r = run(TITLE, "Route Finder: System Documentation");
    expect(r.status).toBe("FOUND");
    expect(r.unverified).toBeUndefined();
    expect(r.evidence).toEqual([{ type: "doc", ref: TITLE, quote: "", heading: true }]);
  });

  it("accepts a heading quote, even a part of it", () => {
    expect(run("GUI Overview", "gui   overview").evidence[0]).toMatchObject({ heading: true, ref: "GUI Overview" });
    const part = run(TITLE, "System Documentation");
    expect(part.status).toBe("FOUND");
    expect(part.evidence[0]).toMatchObject({ type: "doc", ref: TITLE, quote: "System Documentation" });
  });

  it("accepts a table-cell or caption quote that the section body text never held", () => {
    const r = run("Testing", "Login screen loads in two seconds");
    expect(r.status).toBe("FOUND");
    expect(r.evidence[0]).toMatchObject({ type: "doc", ref: "Testing", authors: [7] });
    expect(run("Testing", "Figure 3: Route map of Cebu City").status).toBe("FOUND");
  });

  it("accepts different punctuation, quotes, case or a trailing period", () => {
    expect(run("GUI Overview", "The interface is built with Tkinter").status).toBe("FOUND");
    expect(run("Testing", "Figure 3 — Route map of Cebu City.").status).toBe("NOT_FOUND");
    expect(run("Testing", "figure 3: route map of cebu city.").status).toBe("FOUND");
    expect(run("GUI Overview", "the interface is   built with tkinter.").status).toBe("FOUND");
  });

  it("rejects a quote that appears nowhere in the document", () => {
    expect(run("GUI Overview", "The interface is built with Qt and Electron")).toMatchObject({ status: "NOT_FOUND", unverified: true });
  });

  it("re-anchors a wrong ref to the nearest heading above the quote", () => {
    const r = run("Invented Section", "Login screen loads in two seconds");
    expect(r.status).toBe("FOUND");
    expect(r.evidence[0]).toMatchObject({ type: "doc", ref: "Testing" });
    const top = run("(before the first heading)", "built with Tkinter");
    expect(top.evidence[0]).toMatchObject({ ref: "GUI Overview" });
  });

  it("rejects a fabricated quote even with a real ref", () => {
    expect(run("Testing", "All tests pass on every device")).toMatchObject({ status: "NOT_FOUND", unverified: true });
  });
});

describe("Docs proof: minimum quote length", () => {
  it("rejects a 5-character quote that does match the document", () => {
    const r = run("GUI Overview", "built");
    expect(r).toMatchObject({ status: "NOT_FOUND", unverified: true });
  });

  it("accepts a short quote only when it equals a whole heading", () => {
    const r = run("Testing", "testing");
    expect(r.status).toBe("FOUND");
    expect(r.evidence[0]).toMatchObject({ heading: true, ref: "Testing" });
  });

  it("accepts a quote of 8 or more characters that appears in the document", () => {
    expect(run("GUI Overview", "with Tkinter.").status).toBe("FOUND");
  });
});

describe("proof check counter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("counts found requirements and why they were demoted", () => {
    const out = verifyRequirements([
      req([{ type: "doc", ref: "Testing", quote: "Login screen loads in two seconds" }]),
      req([{ type: "doc", ref: "Testing", quote: "Nothing like this is written" }]),
      req([{ type: "file", ref: "src/missing.ts", quote: "" }]),
      req([], "NOT_FOUND"),
    ], ctx());
    expect(out.proof).toEqual({
      claimed: 3, demoted: 2, importOnly: 0, tooShort: 0, quoteNotFound: 1, refNotFound: 1, capped: 0, droppedNoSource: 0,
    });
  });
});

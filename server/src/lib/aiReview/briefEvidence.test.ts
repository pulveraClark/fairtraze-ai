import { describe, it, expect } from "vitest";
import {
  briefFingerprint, briefHash, buildDocSections, fitBriefInput, inputSize, selectKeyFiles, selectTreePaths, verifyRequirements,
  MAX_KEY_FILES, MAX_TREE_PATHS, MAX_REQUIREMENTS, type BriefVerifyContext,
} from "./briefEvidence.js";
import { validateBriefOutput, type RawRequirement } from "./prompts.js";
import type { DocPiece } from "./docsEvidence.js";

const piece = (start: number, text: string, heading: string | null, isHeading = false): DocPiece => ({
  start, end: start + text.length, text, heading, isHeading,
});

describe("briefFingerprint", () => {
  const a = { id: 1, size: 100, mime: "application/pdf" };
  const b = { id: 2, size: 50, mime: "image/png" };

  it("equals the old text-only hash when there are no attachments", () => {
    expect(briefFingerprint("  Build a thing ", [])).toBe(briefHash("Build a thing"));
  });

  it("changes when a file is added, removed, replaced or the text changes", () => {
    const base = briefFingerprint("Build a thing", [a]);
    expect(base).not.toBe(briefHash("Build a thing"));
    expect(briefFingerprint("Build a thing", [a, b])).not.toBe(base);
    expect(briefFingerprint("Build a thing", [])).not.toBe(base);
    expect(briefFingerprint("Build a thing", [{ ...a, id: 3 }])).not.toBe(base);
    expect(briefFingerprint("Build another thing", [a])).not.toBe(base);
  });

  it("is stable and ignores surrounding whitespace in the text", () => {
    expect(briefFingerprint(" x ", [a, b])).toBe(briefFingerprint("x", [a, b]));
  });
});

describe("what is sent", () => {
  it("lists shallow paths first, drops generated, lock, binary and secret files, and caps the list", () => {
    const many = Array.from({ length: 400 }, (_, i) => `src/f${i}.ts`);
    const out = selectTreePaths(["package-lock.json", "logo.png", ".env", "README.md", "src/deep/a/b.ts", ...many]);
    expect(out[0]).toBe("README.md");
    expect(out).not.toContain("package-lock.json");
    expect(out).not.toContain("logo.png");
    expect(out).not.toContain(".env");
    expect(out).toHaveLength(MAX_TREE_PATHS);
  });

  it("key files: README first, then the most-added files that exist, at most 12", () => {
    const tree = ["README.md", "src/a.ts", "src/b.ts", "gone.ts", ...Array.from({ length: 20 }, (_, i) => `f${i}.ts`)];
    const added = new Map<string, number>([["src/a.ts", 5], ["src/b.ts", 50], ["deleted.ts", 999], ...Array.from({ length: 20 }, (_, i) => [`f${i}.ts`, i] as [string, number])]);
    const keys = selectKeyFiles(tree, added);
    expect(keys[0]).toBe("README.md");
    expect(keys[1]).toBe("src/b.ts");
    expect(keys).not.toContain("deleted.ts");
    expect(keys).toHaveLength(MAX_KEY_FILES);
  });

  it("document: every heading stays, section text is shortened once the budget is used", () => {
    const pieces = [
      piece(0, "Intro", "Intro", true), piece(5, "a".repeat(1000), "Intro"),
      piece(1005, "Method", "Method", true), piece(1011, "b".repeat(1000), "Method"),
      piece(2011, "Results", "Results", true), piece(2018, "c".repeat(1000), "Results"),
    ];
    const s = buildDocSections(pieces, 900, 600);
    expect(s.map((d) => d.heading)).toEqual(["Intro", "Method", "Results"]);
    expect(s[0]!.text).toHaveLength(600);
    expect(s[1]!.text).toHaveLength(300);
    expect(s[2]!.text).toBe("");
  });

  it("over the cap: shrinks files, then documents, then paths, and never cuts the brief", () => {
    const brief = "Requirement text. ".repeat(300);
    const input = {
      brief,
      paths: Array.from({ length: 300 }, (_, i) => `src/some/long/path/file${i}.ts`),
      files: Array.from({ length: 12 }, (_, i) => ({ path: `f${i}.ts`, excerpt: "x".repeat(2000) })),
      docs: Array.from({ length: 12 }, (_, i) => ({ heading: `H${i}`, text: "y".repeat(600) })),
    };
    const fitted = fitBriefInput(input, 20_000);
    expect(fitted.brief).toBe(brief);
    expect(inputSize(fitted)).toBeLessThanOrEqual(20_000);
    expect(fitted.docs).toHaveLength(12);
  });

  it("brief hash ignores outer whitespace and changes with the text", () => {
    expect(briefHash(" a ")).toBe(briefHash("a"));
    expect(briefHash("a")).not.toBe(briefHash("b"));
  });
});

const ctx = (over: Partial<BriefVerifyContext> = {}): BriefVerifyContext => ({
  paths: new Set(["src/Login.tsx", "README.md"]),
  fileText: new Map([["src/Login.tsx", "export function Login() {\n  return <form>Sign   in</form>;\n}"]]),
  docs: [{ heading: "Methodology", text: "We surveyed 40 students about login habits." }],
  pieces: [piece(0, "Methodology", "Methodology", true), piece(11, "We surveyed 40 students about login habits.", "Methodology")],
  spans: [{ userId: 7, start: 11, end: 54 }],
  ...over,
});
const req = (r: Partial<RawRequirement>): RawRequirement => ({ text: "Has a login page", status: "FOUND", evidence: [], ...r });

describe("verifyRequirements", () => {
  it("keeps evidence that is in what was sent (whitespace and case do not matter)", () => {
    const [r] = verifyRequirements([req({ evidence: [{ type: "file", ref: "src/Login.tsx", quote: "<form>sign in</form>" }, { type: "doc", ref: "Methodology", quote: "We surveyed 40 students" }] })], ctx());
    expect(r!.status).toBe("FOUND");
    expect(r!.evidence).toHaveLength(2);
    expect(r!.evidence[1]).toMatchObject({ type: "doc", authors: [7] });
  });

  it("drops invented paths, headings and quotes; Found with nothing left becomes Not found, flagged", () => {
    const [r] = verifyRequirements([req({ evidence: [
      { type: "file", ref: "src/Made.tsx", quote: "" },
      { type: "file", ref: "src/Login.tsx", quote: "a line that is not there" },
      { type: "doc", ref: "Conclusion", quote: "We surveyed" },
      { type: "doc", ref: "Methodology", quote: "invented sentence" },
    ] })], ctx());
    expect(r).toMatchObject({ status: "NOT_FOUND", evidence: [], unverified: true });
  });

  it("Partly found keeps the evidence that does verify and drops the rest", () => {
    const [r] = verifyRequirements([req({ status: "PARTLY_FOUND", evidence: [{ type: "file", ref: "README.md", quote: "" }, { type: "file", ref: "src/Login.tsx", quote: "nope" }] })], ctx());
    expect(r!.status).toBe("PARTLY_FOUND");
    expect(r!.evidence.map((e) => e.ref)).toEqual(["README.md"]);
  });

  it("Not found carries no evidence even if the model sent some; blank requirements are dropped; count is capped", () => {
    const raw = [
      req({ status: "NOT_FOUND", evidence: [{ type: "file", ref: "README.md", quote: "" }] }),
      req({ text: "  " }),
      ...Array.from({ length: 30 }, (_, i) => req({ text: `R${i}`, status: "NOT_FOUND" })),
    ];
    const out = verifyRequirements(raw, ctx());
    expect(out[0]).toMatchObject({ status: "NOT_FOUND", evidence: [] });
    expect(out[0]!.unverified).toBeUndefined();
    expect(out).toHaveLength(MAX_REQUIREMENTS);
  });

  it("a doc quote not found in any authored piece has no authors (so it is hidden from the leader)", () => {
    const [r] = verifyRequirements([req({ evidence: [{ type: "doc", ref: "Methodology", quote: "We surveyed" }] })], ctx({ pieces: [], spans: [] }));
    expect(r!.evidence[0]!.authors).toEqual([]);
  });
});

describe("validateBriefOutput", () => {
  it("accepts the expected shape and rejects anything else", () => {
    expect(validateBriefOutput({ requirements: [{ text: "x", status: "FOUND", evidence: [{ type: "file", ref: "a", quote: "" }] }] })).toHaveLength(1);
    expect(validateBriefOutput({ requirements: [{ text: "x", status: "GOOD", evidence: [] }] })).toBeNull();
    expect(validateBriefOutput({ requirements: [{ text: "x", status: "FOUND", evidence: [{ type: "web", ref: "a", quote: "" }] }] })).toBeNull();
    expect(validateBriefOutput({ nope: 1 })).toBeNull();
  });
});

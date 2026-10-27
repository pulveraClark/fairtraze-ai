import { describe, it, expect, vi, afterEach } from "vitest";
import { logProofCheck, rejectionLine, verifyRequirements, type BriefVerifyContext } from "./briefEvidence.js";
import type { RawRequirement } from "./prompts.js";
import type { DocPiece } from "./docsEvidence.js";

const piece = (start: number, text: string, heading: string | null, isHeading = false): DocPiece => ({
  start, end: start + text.length, text, heading, isHeading,
});
const GUI_FILE = "import os\nimport requests\n\nroot = Tk()";
const ctx = (): BriefVerifyContext => ({
  source: { instructions: "Use a Tkinter GUI. Build a route planner. Write system documentation.", files: [] },
  paths: new Set(["gui.py"]),
  fileText: new Map([["gui.py", GUI_FILE]]),
  docs: [{ heading: "GUI Overview", text: "The interface is built with Tkinter." }],
  pieces: [piece(0, "GUI Overview", "GUI Overview", true), piece(12, "The interface is built with Tkinter.", "GUI Overview")],
  spans: [],
});
const req = (text: string, sourceQuote: string, evidence: RawRequirement["evidence"]): RawRequirement => ({ text, status: "FOUND", sourceQuote, evidence });

afterEach(() => vi.restoreAllMocks());

describe("proof check counter: reasons and log lines", () => {
  const raw = [
    req("Build a route planner.", "Build a route planner.", [{ type: "file", ref: "gui.py", quote: "import os\nimport requests" }]),
    req("Use a Tkinter GUI.", "Use a Tkinter GUI.", [{ type: "doc", ref: "GUI Overview", quote: "Tkinter" }]),
    req("Write system documentation.", "Write system documentation.", [{ type: "doc", ref: "GUI Overview", quote: "Nothing like this is written anywhere" }]),
    req("Has a CLI", "Use a Tkinter GUI.", [{ type: "file", ref: "missing.py", quote: "" }]),
    req("Invented", "Deploy to the cloud.", []),
  ];

  it("splits the demoted requirements by the reason of their first rejected evidence", () => {
    const out = verifyRequirements(raw, ctx());
    expect(out.proof).toEqual({
      claimed: 4, demoted: 4, importOnly: 1, tooShort: 1, quoteNotFound: 1, refNotFound: 1, capped: 0, droppedNoSource: 1,
    });
    expect(out.droppedCount).toBe(1);
    expect(out.rejections.map((r) => `${r.type}:${r.reason}`)).toEqual(["file:import only", "doc:too short", "doc:quote not found", "file:ref not found"]);
  });

  it("writes one summary line, then one line per rejected evidence item", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const out = verifyRequirements(raw, ctx());
    logProofCheck("brief (group 89)", out.proof, out.rejections);
    const lines = info.mock.calls.map((c) => c[0] as string);
    expect(lines).toHaveLength(1 + 4);
    expect(lines[0]).toBe(
      "[ai-review] proof check brief (group 89): 4 marked found or partly found, 4 demoted to unverified (import only 1, too short 1, quote not found 1, ref not found 1), capped 0, dropped for no source 1",
    );
    expect(lines[1]).toBe('[ai-review] proof rejected brief (group 89): "Build a route planner." file import only: "import os import requests"');
    expect(lines[2]).toBe('[ai-review] proof rejected brief (group 89): "Use a Tkinter GUI." doc too short: "Tkinter"');
  });

  it("truncates the requirement to 60 characters and the quote to 80, on one line", () => {
    const line = rejectionLine("brief (group 1)", { requirement: "R".repeat(100), type: "doc", reason: "quote not found", quote: `${"q".repeat(50)}\n\n${"z".repeat(100)}` });
    expect(line).toBe(`[ai-review] proof rejected brief (group 1): "${"R".repeat(60)}" doc quote not found: "${"q".repeat(50)} ${"z".repeat(29)}"`);
    expect(line).not.toContain("\n");
  });

  it("logs nothing about requirements that were proved", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const ok = verifyRequirements([req("Use a Tkinter GUI.", "Use a Tkinter GUI.", [{ type: "doc", ref: "GUI Overview", quote: "built with Tkinter" }])], ctx());
    logProofCheck("brief (group 2)", ok.proof, ok.rejections);
    expect(info).toHaveBeenCalledTimes(1);
  });
});

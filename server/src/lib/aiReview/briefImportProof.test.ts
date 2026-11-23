import { describe, it, expect } from "vitest";
import { importedNames, requirementNamesImport, verifyRequirements, type BriefVerifyContext } from "./briefEvidence.js";
import { BRIEF_PROMPT_VERSION, BRIEF_SYSTEM, type RawRequirement } from "./prompts.js";

const IMPORTS = "import os\nimport requests\nimport tkinter as tk\nfrom tkinter import ttk, messagebox";
const ctx = (): BriefVerifyContext => ({
  source: { instructions: "Build a route planner. Use a Tkinter GUI. Handle all the requests from users.", files: [] },
  paths: new Set(["gui.py"]),
  fileText: new Map([["gui.py", `${IMPORTS}\n\nroot = tk.Tk()`]]),
  docs: [],
  pieces: [],
  spans: [],
});
const run = (text: string, sourceQuote: string, quote = IMPORTS) =>
  verifyRequirements([{ text, status: "FOUND", sourceQuote, evidence: [{ type: "file", ref: "gui.py", quote }] } as RawRequirement], ctx()).requirements[0]!;

describe("an import proves a requirement only when it names that library", () => {
  it("reads the library names, not the keywords or the alias", () => {
    expect(importedNames(IMPORTS)).toEqual(expect.arrayContaining(["requests", "tkinter", "ttk", "messagebox"]));
    expect(importedNames(IMPORTS)).not.toContain("import");
    expect(importedNames("import numpy as np")).toEqual(["numpy"]);
    expect(importedNames("const fs = require(\"graphhopper\");")).toEqual(["graphhopper"]);
  });

  it("accepts imports for a requirement that names the library (case and word boundary)", () => {
    const r = run("Use a Tkinter GUI.", "Use a Tkinter GUI.");
    expect(r.status).toBe("FOUND");
    expect(r.unverified).toBeUndefined();
    expect(r.evidence).toHaveLength(1);
    expect(requirementNamesImport("from graphhopper import Client", "Build a GraphHopper route planner.")).toBe(true);
  });

  it("does not borrow the source sentence: the requirement's own text must name the library", () => {
    // Both requirements come from the same sentence, which names GraphHopper and Tkinter.
    const c = ctx();
    c.source.instructions = "Build a GraphHopper route planner with a Tkinter GUI.";
    const sentence = "Build a GraphHopper route planner with a Tkinter GUI.";
    const prove = (text: string, quote: string) =>
      verifyRequirements([{ text, status: "FOUND", sourceQuote: sentence, evidence: [{ type: "file", ref: "gui.py", quote }] } as RawRequirement], c).requirements[0]!;
    expect(prove("Use a Tkinter GUI.", "import tkinter as tk").status).toBe("FOUND");
    expect(prove("Build a GraphHopper route planner.", "import tkinter as tk")).toMatchObject({ status: "NOT_FOUND", unverified: true });
    expect(prove("Build a GraphHopper route planner.", "root = tk.Tk()").status).toBe("FOUND");
    c.fileText.set("gui.py", `${IMPORTS}
client = graphhopper.Client(KEY)`);
    expect(prove("Build a GraphHopper route planner.", "client = graphhopper.Client(KEY)").status).toBe("FOUND");
  });

  it("a file named Graphhopper.py with only 'import requests' does not prove the planner", () => {
    const c = ctx();
    c.source.instructions = "Build a GraphHopper route planner.";
    c.paths = new Set(["Graphhopper.py"]);
    c.fileText = new Map([["Graphhopper.py", "import os\nimport requests\n\ndef plan():\n    pass"]]);
    const r = verifyRequirements([{
      text: "Build a GraphHopper route planner.", status: "FOUND", sourceQuote: "Build a GraphHopper route planner.",
      evidence: [{ type: "file", ref: "Graphhopper.py", quote: "import os\nimport requests" }],
    } as RawRequirement], c).requirements[0]!;
    expect(r).toMatchObject({ status: "NOT_FOUND", unverified: true });
  });

  it("still rejects imports for a general requirement", () => {
    const r = run("Build a route planner.", "Build a route planner.");
    expect(r).toMatchObject({ status: "NOT_FOUND", evidence: [], unverified: true });
  });

  it("does not match inside a longer word", () => {
    expect(requirementNamesImport("import tk_tools", "Build a tk_tools_extra window")).toBe(false);
    expect(requirementNamesImport("import requests", "Handle all the requests from users")).toBe(true);
    expect(requirementNamesImport("import requests", "Handle requestsmade by users")).toBe(false);
  });

  it("real code is unaffected", () => {
    expect(run("Has a window", "Build a route planner.", "root = tk.Tk()").status).toBe("FOUND");
  });
});

describe("prompt", () => {
  it("allows imports when the requirement names the library, and the version moved", () => {
    expect(BRIEF_SYSTEM).toMatch(/except when the requirement names that library or tool/);
    expect(BRIEF_PROMPT_VERSION).toBe("brief-3");
  });
});

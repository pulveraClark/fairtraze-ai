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

  it("names it through the requirement's source sentence too", () => {
    expect(run("Has a window", "Use a Tkinter GUI.").status).toBe("FOUND");
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

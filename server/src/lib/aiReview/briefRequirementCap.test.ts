import { describe, it, expect } from "vitest";
import { MAX_REQUIREMENTS, maxRequirementsFor, verifyRequirements, type BriefVerifyContext } from "./briefEvidence.js";
import type { RawRequirement } from "./prompts.js";

const EXAMPLE = "Build a GraphHopper route planner with a Tkinter GUI and write its system documentation.";

describe("maxRequirementsFor", () => {
  it("the example brief supports 3: 1 sentence + 1 ' and ' = 2 clauses, plus one", () => {
    expect(maxRequirementsFor(EXAMPLE)).toBe(3);
  });

  it("counts sentences, lines, list items and separators", () => {
    expect(maxRequirementsFor("Build a planner.")).toBe(2);
    expect(maxRequirementsFor("Build a planner. Use a GUI.")).toBe(3);
    expect(maxRequirementsFor("- Login\n- Reports\n- Charts")).toBe(4);
    expect(maxRequirementsFor("Plan, build; test, and ship.")).toBe(1 + 4 + 1);
    expect(maxRequirementsFor("Version 1.2 is required.")).toBe(2);
  });

  it("whole words only for 'and', never above the global limit, and empty text cannot be counted", () => {
    expect(maxRequirementsFor("Handle sandbox islands.")).toBe(2);
    expect(maxRequirementsFor(Array.from({ length: 30 }, (_, i) => `Item ${i}.`).join("\n"))).toBe(MAX_REQUIREMENTS);
    expect(maxRequirementsFor("   ")).toBe(MAX_REQUIREMENTS);
  });
});

const ctx = (instructions: string, files: string[] = []): BriefVerifyContext => ({
  source: { instructions, files }, paths: new Set(), fileText: new Map(), docs: [], pieces: [], spans: [],
});
const item = (text: string, sourceQuote: string): RawRequirement => ({ text, status: "NOT_FOUND", evidence: [], sourceQuote });

describe("the cap is applied after the source check", () => {
  const instructions = "Build a route planner. Use a Tkinter GUI."; // cap 3

  it("keeps a real item that comes after invented ones, and counts only the invented ones as left out", () => {
    const raw = [
      item("Invented one", "Deploy it to the cloud."),
      item("Invented two", "Add a login page."),
      item("Invented three", "Write unit tests."),
      item("Invented four", "Support dark mode."),
      item("Build a route planner.", "Build a route planner."),
      item("Use a Tkinter GUI.", "Use a Tkinter GUI."),
    ];
    const out = verifyRequirements(raw, ctx(instructions));
    expect(out.requirements.map((r) => r.text)).toEqual(["Build a route planner.", "Use a Tkinter GUI."]);
    expect(out.droppedCount).toBe(4);
    expect(out.proof.capped).toBe(0);
  });

  it("discards sourced items past the cap, in the AI's order, without adding them to droppedCount", () => {
    const raw = ["One thing.", "Two things.", "Three things.", "Four things.", "Five things."].map((t) => item(t, "Build a route planner."));
    const out = verifyRequirements(raw, ctx(instructions));
    expect(out.requirements.map((r) => r.text)).toEqual(["One thing.", "Two things.", "Three things."]);
    expect(out.droppedCount).toBe(0);
    expect(out.proof.capped).toBe(2);
  });

  it("does not cap below the global limit when the brief has attached files", () => {
    const raw = Array.from({ length: 6 }, (_, i) => item(`Thing ${i}`, "Build a route planner."));
    expect(verifyRequirements(raw, ctx(instructions, ["brief.pdf"])).requirements).toHaveLength(6);
  });
});

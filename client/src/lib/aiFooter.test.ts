import { describe, expect, it } from "vitest";
import { aiFooterLine } from "./aiFooter";

describe("aiFooterLine", () => {
  it("is one line: may be wrong, when, informational only, and what is not counted", () => {
    expect(aiFooterLine("Oct 24, 2026")).toBe(
      "May be wrong · Based on the analysis of Oct 24, 2026. Informational only; it does not assign grades or replace instructor judgment. " +
      "Work outside GitHub and FairTraze Docs, such as meetings, research, design and offline work, is not counted.",
    );
  });

  it("without a date it drops the 'Based on' part only", () => {
    expect(aiFooterLine()).toBe(
      "May be wrong. Informational only; it does not assign grades or replace instructor judgment. " +
      "Work outside GitHub and FairTraze Docs, such as meetings, research, design and offline work, is not counted.",
    );
  });

  it("never mentions Gini, bands or an index (the leader sees this line too)", () => {
    expect(aiFooterLine("today")).not.toMatch(/gini|band|index/i);
  });
});

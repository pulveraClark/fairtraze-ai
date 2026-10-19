import { describe, it, expect } from "vitest";
import { groupCrumbLabels } from "./groupCrumbs";

describe("groupCrumbLabels", () => {
  it("uses the real class code and assignment title", () => {
    expect(groupCrumbLabels({ classCode: "UXA-101", assignmentTitle: "Capstone Proposal", assignmentLabel: "General Assignment" }))
      .toEqual({ classLabel: "UXA-101", assignmentLabel: "Capstone Proposal" });
  });
  it("does not turn the 'General Assignment' placeholder into a class name", () => {
    expect(groupCrumbLabels({ assignmentLabel: "General Assignment" })).toEqual({ classLabel: "Class", assignmentLabel: "Assignment" });
  });
  it("falls back to the parsed label for older payloads", () => {
    expect(groupCrumbLabels({ assignmentLabel: "CC-APPSDEV22 — Applications Development" }).classLabel).toBe("CC-APPSDEV22");
  });
  it("copes with no data yet", () => {
    expect(groupCrumbLabels(null)).toEqual({ classLabel: "Class", assignmentLabel: "Assignment" });
  });
});

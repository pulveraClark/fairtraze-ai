import { describe, it, expect } from "vitest";
import { exportClassLabel } from "./classLabel";

describe("exportClassLabel", () => {
  it("builds the label from the real class and assignment, never the placeholder", () => {
    expect(exportClassLabel({ assignmentLabel: "General Assignment", classCode: "UXA-101", classSubjectName: "Applications Development", assignmentTitle: "Capstone" }))
      .toBe("UXA-101 \u00B7 Applications Development \u2014 Capstone");
  });
  it("works with only the code, or without an assignment title", () => {
    expect(exportClassLabel({ classCode: "UXA-101" })).toBe("UXA-101");
    expect(exportClassLabel({ classCode: "UXA-101", classSubjectName: "Apps" })).toBe("UXA-101 \u00B7 Apps");
  });
  it("falls back to a real legacy label, but drops the 'General Assignment' placeholder", () => {
    expect(exportClassLabel({ assignmentLabel: "CC-APPSDEV22 \u2014 Applications Development" })).toBe("CC-APPSDEV22 \u2014 Applications Development");
    expect(exportClassLabel({ assignmentLabel: "General Assignment" })).toBe("");
    expect(exportClassLabel(null)).toBe("");
  });
});

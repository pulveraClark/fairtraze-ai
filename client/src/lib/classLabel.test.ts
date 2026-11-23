import { describe, it, expect } from "vitest";
import { classCrumb, classFullLabel, classShortLabel, classTooltip } from "./classLabel";

describe("classLabel (I12)", () => {
  it("writes the one format: subject code · EDP code", () => {
    expect(classFullLabel({ subjectCode: "UXA-101", edpCode: "12345" })).toBe("UXA-101 · EDP 12345");
  });
  it("leaves out the EDP part when there is none", () => {
    expect(classFullLabel({ subjectCode: "UXA-101", edpCode: "" })).toBe("UXA-101");
    expect(classFullLabel({ subjectCode: "UXA-101" })).toBe("UXA-101");
  });
  it("never loses the EDP code", () => {
    expect(classFullLabel({ subjectCode: "", edpCode: "12345" })).toBe("EDP 12345");
  });
  it("breadcrumbs and the sidebar show the subject code only, with the full label as the tooltip", () => {
    const c = { subjectCode: "UXA-101", edpCode: "12345" };
    expect(classShortLabel(c)).toBe("UXA-101");
    expect(classTooltip(c)).toBe("UXA-101 · EDP 12345");
    expect(classCrumb(c, "/class/1")).toEqual({ label: "UXA-101", title: "UXA-101 · EDP 12345", href: "/class/1" });
  });
  it("has no tooltip when the label says everything, and a fallback while loading", () => {
    expect(classTooltip({ subjectCode: "UXA-101" })).toBeUndefined();
    expect(classCrumb(null)).toEqual({ label: "Class", title: undefined });
  });
});

import { describe, it, expect } from "vitest";
import { groupTabs, resolveTab, tabFromSearch } from "./groupTabs";

describe("groupTabs (17)", () => {
  it("students: FairTraze Docs, Tasks, Report; Docs is the default", () => {
    for (const source of ["EDITOR", "COMBINED"]) {
      const tabs = groupTabs("student", source);
      expect(tabs).toEqual(["document", "tasks", "report"]);
      expect(resolveTab(null, tabs)).toBe("document");
    }
  });

  it("instructors: Report, FairTraze Docs, Tasks; Report is the default", () => {
    const tabs = groupTabs("instructor", "COMBINED");
    expect(tabs).toEqual(["report", "document", "tasks"]);
    expect(resolveTab(null, tabs)).toBe("report");
  });

  it("GitHub-only projects have no Docs tab and keep the same relative order", () => {
    expect(groupTabs("student", "GITHUB")).toEqual(["tasks", "report"]);
    expect(groupTabs("instructor", "GITHUB")).toEqual(["report", "tasks"]);
    expect(groupTabs("instructor", null)).toEqual(["report", "tasks"]);
  });

  it("?tab= links keep working, including ?tab=report for students", () => {
    const tabs = groupTabs("student", "COMBINED");
    expect(resolveTab(tabFromSearch("?tab=report"), tabs)).toBe("report");
    expect(resolveTab(tabFromSearch("?tab=tasks&task=4"), tabs)).toBe("tasks");
    expect(resolveTab(tabFromSearch("?tab=document"), tabs)).toBe("document");
  });

  it("an unknown tab, or one this project does not have, falls back to the default", () => {
    expect(tabFromSearch("?tab=nope")).toBeNull();
    expect(tabFromSearch("")).toBeNull();
    expect(resolveTab("document", groupTabs("student", "GITHUB"))).toBe("tasks");
  });
});

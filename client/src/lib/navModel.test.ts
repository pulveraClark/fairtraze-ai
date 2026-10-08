import { describe, it, expect } from "vitest";
import {
  MAX_CLASSES,
  MAX_GROUPS,
  buildInstructorTree,
  buildStudentTree,
  getNavItems,
  isItemActive,
  resolveActiveClassId,
} from "./navModel";

const classes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, subjectCode: `C${i + 1}`, subjectName: `Class ${i + 1}`, assignments: [{ id: 100 + i }] }));

describe("getNavItems", () => {
  it("gives admins flat links only (no classes tree)", () => {
    const keys = getNavItems("ADMIN").map((i) => i.key);
    expect(keys).toEqual(["dashboard", "audit", "notifications", "settings"]);
  });
  it("adds Disputes for instructors only", () => {
    expect(getNavItems("INSTRUCTOR").some((i) => i.key === "disputes")).toBe(true);
    expect(getNavItems("STUDENT").some((i) => i.key === "disputes")).toBe(false);
  });
  it("labels the student tree 'My classes'", () => {
    expect(getNavItems("STUDENT").find((i) => i.key === "classes")?.label).toBe("My classes");
  });
});

describe("isItemActive", () => {
  it("marks Classes active only on class-scoped routes", () => {
    expect(isItemActive("INSTRUCTOR", "classes", "/dashboard", "/class/3")).toBe(true);
    expect(isItemActive("INSTRUCTOR", "classes", "/dashboard", "/dashboard")).toBe(false);
    expect(isItemActive("STUDENT", "classes", "/student", "/student/group/4")).toBe(true);
  });
});

describe("resolveActiveClassId", () => {
  it("reads the class from a class route", () => {
    expect(resolveActiveClassId("INSTRUCTOR", "/class/7/assignment/2", undefined, undefined)).toBe(7);
  });
  it("resolves a project route through the groups summary, and is null until it loads", () => {
    expect(resolveActiveClassId("INSTRUCTOR", "/project/9", undefined, undefined)).toBeNull();
    expect(resolveActiveClassId("INSTRUCTOR", "/project/9", [{ projectId: 9, groupName: "G", classId: 4 }], undefined)).toBe(4);
  });
  it("resolves a student group route through the student's own groups", () => {
    const student = [{ id: 2, assignments: [{ myGroup: { id: 55, groupName: "Mine" } }] }];
    expect(resolveActiveClassId("STUDENT", "/student/group/55", undefined, student)).toBe(2);
  });
});

describe("buildInstructorTree", () => {
  it("caps classes at the limit and reports the overflow", () => {
    const tree = buildInstructorTree(classes(12), [], "/dashboard", null);
    expect(tree.classes).toHaveLength(MAX_CLASSES);
    expect(tree.hiddenClassCount).toBe(12 - MAX_CLASSES);
  });
  it("keeps the active class visible even when it falls past the cap", () => {
    const tree = buildInstructorTree(classes(12), [], "/class/11", 11);
    expect(tree.classes.map((c) => c.id)).toContain(11);
    expect(tree.classes).toHaveLength(MAX_CLASSES);
  });
  it("joins groups by classId and caps groups per class", () => {
    const groups = Array.from({ length: 11 }, (_, i) => ({ projectId: i + 1, groupName: `G${i + 1}`, classId: 1 }));
    groups.push({ projectId: 99, groupName: "Other", classId: 2 });
    const tree = buildInstructorTree(classes(2), groups, "/project/3", 1);
    expect(tree.classes[0].groups).toHaveLength(MAX_GROUPS);
    expect(tree.classes[0].hiddenGroupCount).toBe(3);
    expect(tree.classes[0].groups.find((g) => g.id === 3)?.active).toBe(true);
    expect(tree.classes[1].groups.map((g) => g.id)).toEqual([99]);
  });
});

describe("buildStudentTree", () => {
  it("lists only the student's own group per class", () => {
    const tree = buildStudentTree(
      [
        { id: 1, subjectCode: "A", assignments: [{ myGroup: { id: 10, groupName: "Mine" } }, { myGroup: null }] },
        { id: 2, subjectCode: "B", assignments: [{ myGroup: null }] },
      ],
      "/student/group/10",
      1
    );
    expect(tree.classes[0].groups.map((g) => g.label)).toEqual(["Mine"]);
    expect(tree.classes[0].groups[0].active).toBe(true);
    expect(tree.classes[1].groups).toEqual([]);
    expect(tree.viewAllHref).toBe("/student");
  });
});

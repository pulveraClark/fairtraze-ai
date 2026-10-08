import { describe, it, expect } from "vitest";
import {
  MAX_CLASSES,
  MAX_GROUPS,
  MAX_PROJECTS,
  buildInstructorTree,
  buildStudentTree,
  getNavItems,
  isItemActive,
  resolveActiveAssignmentId,
  resolveActiveClassId,
} from "./navModel";

const classes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, subjectCode: `C${i + 1}`, subjectName: `Class ${i + 1}`, assignments: [{ id: 100 + i, title: `Project ${i + 1}` }] }));
const projects = (classId: number, n: number) =>
  ({ id: classId, subjectCode: "C", assignments: Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `P${i + 1}` })) });

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

describe("resolveActiveAssignmentId", () => {
  it("reads the assignment from an assignment route", () => {
    expect(resolveActiveAssignmentId("INSTRUCTOR", "/class/7/assignment/2", undefined, undefined)).toBe(2);
  });
  it("resolves a project route through the groups summary, and is null until it loads", () => {
    expect(resolveActiveAssignmentId("INSTRUCTOR", "/project/9", undefined, undefined)).toBeNull();
    expect(resolveActiveAssignmentId("INSTRUCTOR", "/project/9", [{ projectId: 9, groupName: "G", classId: 4, assignmentId: 6 }], undefined)).toBe(6);
  });
  it("resolves a student group route to the assignment holding the group", () => {
    const student = [{ id: 2, assignments: [{ id: 8, myGroup: { id: 55, groupName: "Mine" } }] }];
    expect(resolveActiveAssignmentId("STUDENT", "/student/group/55", undefined, student)).toBe(8);
    expect(resolveActiveAssignmentId("STUDENT", "/student/class/2", undefined, student)).toBeNull();
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
  it("lists a class's projects linking to the assignment page, with no groups when none is active", () => {
    const tree = buildInstructorTree([projects(1, 3)], [{ projectId: 5, groupName: "G", classId: 1, assignmentId: 2 }], "/class/1", 1, null);
    expect(tree.classes[0].projects.map((p) => p.label)).toEqual(["P1", "P2", "P3"]);
    expect(tree.classes[0].projects[0].href).toBe("/class/1/assignment/1");
    expect(tree.classes[0].projects.every((p) => p.groups.length === 0)).toBe(true);
  });
  it("marks the project active on its assignment page", () => {
    const tree = buildInstructorTree([projects(1, 2)], [], "/class/1/assignment/2", 1, 2);
    expect(tree.classes[0].projects.map((p) => p.active)).toEqual([false, true]);
  });
  it("caps projects and keeps the active one visible", () => {
    const tree = buildInstructorTree([projects(1, 12)], [], "/class/1/assignment/11", 1, 11);
    expect(tree.classes[0].projects).toHaveLength(MAX_PROJECTS);
    expect(tree.classes[0].projects.map((p) => p.id)).toContain(11);
    expect(tree.classes[0].hiddenProjectCount).toBe(12 - MAX_PROJECTS);
  });
  it("shows groups only under the active project, joined by assignmentId, capped", () => {
    const groups = Array.from({ length: 11 }, (_, i) => ({ projectId: i + 1, groupName: `G${i + 1}`, classId: 1, assignmentId: 1 }));
    groups.push({ projectId: 99, groupName: "Other", classId: 1, assignmentId: 2 });
    const tree = buildInstructorTree([projects(1, 2)], groups, "/project/3", 1, 1);
    const [p1, p2] = tree.classes[0].projects;
    expect(p1.groups).toHaveLength(MAX_GROUPS);
    expect(p1.hiddenGroupCount).toBe(3);
    expect(p1.groups.find((g) => g.id === 3)?.active).toBe(true);
    expect(p2.groups).toEqual([]);
    expect(p2.hiddenGroupCount).toBe(0);
  });
});

describe("buildStudentTree", () => {
  const data = [
    { id: 1, subjectCode: "A", assignments: [
      { id: 10, title: "Proj X", myGroup: { id: 100, groupName: "Mine" } },
      { id: 11, title: "Proj Y", myGroup: null },
      { id: 12, title: "Proj Z", myGroup: { id: 120, groupName: "Other mine" } },
    ] },
    { id: 2, subjectCode: "B", assignments: [{ id: 20, title: "None", myGroup: null }] },
  ];
  it("lists only the student's own projects, with their group only under the active one", () => {
    const tree = buildStudentTree(data, "/student/group/100", 1, 10);
    const projs = tree.classes[0].projects;
    expect(projs.map((p) => p.label)).toEqual(["Proj X", "Proj Z"]);
    expect(projs[0].groups.map((g) => g.label)).toEqual(["Mine"]);
    expect(projs[0].groups[0].active).toBe(true);
    expect(projs[1].groups).toEqual([]);
    expect(tree.classes[1].projects).toEqual([]);
    expect(tree.viewAllHref).toBe("/student");
  });
  it("shows no groups when no project is active", () => {
    const tree = buildStudentTree(data, "/student/class/1", 1, null);
    expect(tree.classes[0].projects.every((p) => p.groups.length === 0)).toBe(true);
  });
});

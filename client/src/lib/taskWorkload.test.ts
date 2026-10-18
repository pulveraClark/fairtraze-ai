import { describe, it, expect } from "vitest";
import { suggestAssignee, suggestAssigneeForTask, taskRoleNeeded } from "./taskWorkload";

const members = [
  { userId: 1, name: "Ana" },
  { userId: 2, name: "Ben" },
  { userId: 3, name: "Cy" },
];
const task = (id: number, assignedToUserId: number | null, done = false) => ({ id, assignedToUserId, done });

describe("suggestAssignee", () => {
  it("suggests the member with the fewest open tasks", () => {
    const h = suggestAssignee(members, [task(1, 1), task(2, 1), task(3, 2)]);
    expect(h.suggestedUserId).toBe(3);
    expect(h.entries.map((e) => e.open)).toEqual([2, 1, 0]);
  });

  it("counts only open tasks, not done or unassigned ones", () => {
    const h = suggestAssignee(members, [task(1, 3, true), task(2, null), task(3, 1), task(4, 2)]);
    expect(h.entries.find((e) => e.userId === 3)?.open).toBe(0);
    expect(h.suggestedUserId).toBe(3);
  });

  it("breaks ties by lower contribution share", () => {
    const h = suggestAssignee(members, [], { 1: 0.5, 2: 0.2, 3: 0.3 });
    expect(h.suggestedUserId).toBe(2);
  });

  it("ranks members with a share ahead of those without when tied", () => {
    const h = suggestAssignee(members, [], { 3: 0.9 });
    expect(h.suggestedUserId).toBe(3);
  });

  it("breaks ties alphabetically when no report exists", () => {
    const h = suggestAssignee([...members].reverse(), []);
    expect(h.suggestedUserId).toBe(1);
  });

  it("a member with zero tasks beats members with open tasks regardless of share", () => {
    const h = suggestAssignee(members, [task(1, 1), task(2, 2)], { 1: 0.1, 2: 0.1, 3: 0.8 });
    expect(h.suggestedUserId).toBe(3);
  });

  it("everyone tied with equal shares falls back to alphabetical", () => {
    const h = suggestAssignee(members, [task(1, 1), task(2, 2), task(3, 3)], { 1: 0.3, 2: 0.3, 3: 0.3 });
    expect(h.suggestedUserId).toBe(1);
  });

  it("excludes the task being edited from its current assignee's count", () => {
    const tasks = [task(1, 1), task(2, 2), task(3, 2)];
    expect(suggestAssignee(members, tasks).suggestedUserId).toBe(3);
    const h = suggestAssignee([members[0], members[1]], tasks, {}, 1);
    expect(h.entries.find((e) => e.userId === 1)?.open).toBe(0);
    expect(h.suggestedUserId).toBe(1);
  });

  it("returns no suggestion for an empty roster", () => {
    expect(suggestAssignee([], [])).toEqual({ entries: [], suggestedUserId: null });
  });
});

describe("suggestAssigneeForTask (role match, then fewest open tasks)", () => {
  const people = [
    { userId: 1, name: "Lee", functionalRoles: ["DEVELOPER"] },
    { userId: 2, name: "Ben", functionalRoles: ["DEVELOPER"] },
    { userId: 3, name: "Ana", functionalRoles: ["DOCUMENTATION"] },
    { userId: 4, name: "Cy", functionalRoles: ["DOCUMENTATION", "DEVELOPER"] },
  ];
  const open = (id: number, who: number | null) => ({ id, assignedToUserId: who, done: false });

  it("sends a task linked to a document heading to the Documentation member with the fewest open tasks", () => {
    const s = suggestAssigneeForTask(people, [open(10, 3), open(11, 3), open(12, 4)], { id: 1, docHeading: "Introduction" }, []);
    expect(s).toMatchObject({ userId: 4, role: "DOCUMENTATION", roleMatched: true, open: 1 });
    expect(s?.reason).toBe("Documentation member with the fewest open tasks (1)");
  });

  it("treats a Documentation label like a linked heading", () => {
    expect(taskRoleNeeded({ docHeading: null }, ["Frontend", " documentation "])).toBe("DOCUMENTATION");
    expect(taskRoleNeeded({ docHeading: null }, ["Frontend"])).toBe("DEVELOPER");
  });

  it("sends other tasks to Developers, fewest open tasks first, then by name", () => {
    const s = suggestAssigneeForTask(people, [open(10, 1), open(11, 4)], { id: 1, docHeading: null }, []);
    expect(s).toMatchObject({ userId: 2, role: "DEVELOPER", roleMatched: true, open: 0 });
    expect(s?.reason).toBe("Developer member with the fewest open tasks (0)");
  });

  it("falls back to the fewest open tasks and says no member holds the role", () => {
    const devsOnly = people.filter((p) => p.functionalRoles.length === 1 && p.functionalRoles[0] === "DEVELOPER");
    const s = suggestAssigneeForTask(devsOnly, [open(10, 1)], { id: 1, docHeading: "Intro" }, []);
    expect(s).toMatchObject({ userId: 2, roleMatched: false, open: 0 });
    expect(s?.reason).toBe("Fewest open tasks (0); no Documentation member");
  });

  it("does not count the task being assigned against its current assignee", () => {
    const two = people.slice(0, 2); // Lee, Ben
    // Task 1 belongs to Lee. Counted, Lee has 1 open and Ben (0) wins; excluded, both are at 0 and the name decides.
    expect(suggestAssigneeForTask(two, [open(1, 1)], { id: 99, docHeading: null }, [])?.userId).toBe(2);
    expect(suggestAssigneeForTask(two, [open(1, 1)], { id: 1, docHeading: null }, [])).toMatchObject({ userId: 2, open: 0 });
    expect(suggestAssigneeForTask([people[0]!], [open(1, 1)], { id: 1, docHeading: null }, [])).toMatchObject({ userId: 1, open: 0 });
  });

  it("returns null for an empty group", () => {
    expect(suggestAssigneeForTask([], [], { id: 1, docHeading: null }, [])).toBeNull();
  });
});

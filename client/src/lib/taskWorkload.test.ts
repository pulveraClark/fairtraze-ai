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

describe("suggestAssigneeForTask (role match, no saved report: fewest open tasks)", () => {
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
    expect(s?.reason).toBe("Fewest open tasks");
  });

  it("treats a Documentation label like a linked heading", () => {
    expect(taskRoleNeeded({ docHeading: null }, ["Frontend", " documentation "])).toBe("DOCUMENTATION");
    expect(taskRoleNeeded({ docHeading: null }, ["Frontend"])).toBe("DEVELOPER");
  });

  // TSK-06
  it("sends other tasks to Developers, fewest open tasks first, then by name", () => {
    const s = suggestAssigneeForTask(people, [open(10, 1), open(11, 4)], { id: 1, docHeading: null }, []);
    expect(s).toMatchObject({ userId: 2, role: "DEVELOPER", roleMatched: true, open: 0 });
    expect(s?.reason).toBe("Fewest open tasks");
  });

  it("falls back to the fewest open tasks and says no member holds the role", () => {
    const devsOnly = people.filter((p) => p.functionalRoles.length === 1 && p.functionalRoles[0] === "DEVELOPER");
    const s = suggestAssigneeForTask(devsOnly, [open(10, 1)], { id: 1, docHeading: "Intro" }, []);
    expect(s).toMatchObject({ userId: 2, roleMatched: false, open: 0 });
    expect(s?.reason).toBe("Fewest open tasks");
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

describe("suggestAssigneeForTask with the latest report (lowest share, skip overload)", () => {
  // Route Team Bang: RTB-7 is unassigned. Christian is flagged for overload; Aldren and Kient are tied at 6.2%.
  const rtb = [
    { userId: 1, name: "Christian Lenizo", functionalRoles: ["DEVELOPER"] },
    { userId: 2, name: "Kient Cruz", functionalRoles: ["DEVELOPER"] },
    { userId: 3, name: "Aldren Baricuatro", functionalRoles: ["DEVELOPER"] },
    { userId: 4, name: "Mia Santos", functionalRoles: ["DEVELOPER"] },
  ];
  const t = (id: number, who: number, done = false) => ({ id, assignedToUserId: who, done });
  const hints = [
    { userId: 1, share: 0.413, overloaded: true },
    { userId: 2, share: 0.0621, overloaded: false },
    { userId: 3, share: 0.0624, overloaded: false },
    { userId: 4, share: 0.2, overloaded: false },
  ];
  const rtb7 = { id: 7, docHeading: null };

  it("RTB-7: Aldren (6.2%, tied with Kient, fewer open tasks) is suggested; Christian (Overload) is skipped", () => {
    const tasks = [t(1, 2), t(2, 2), t(3, 3), t(4, 1), t(5, 1), t(6, 1)];
    const s = suggestAssigneeForTask(rtb, tasks, rtb7, [], hints);
    expect(s).toMatchObject({ userId: 3, name: "Aldren Baricuatro", reason: "Lowest contribution so far." });
  });

  it("a tie on share and open tasks goes to the name", () => {
    const s = suggestAssigneeForTask(rtb, [t(1, 2), t(2, 3)], rtb7, [], hints);
    expect(s?.name).toBe("Aldren Baricuatro");
  });

  it("an overloaded member is never suggested even with the lowest share", () => {
    const s = suggestAssigneeForTask(rtb, [], rtb7, [], [{ ...hints[0]!, share: 0.01 }, ...hints.slice(1)]);
    expect(s?.userId).not.toBe(1);
  });

  it("the role match is kept before the share", () => {
    const mixed = [{ ...rtb[0]!, functionalRoles: ["DOCUMENTATION"] }, { ...rtb[3]!, userId: 5, name: "Zed", functionalRoles: ["DEVELOPER"] }, rtb[2]!];
    const s = suggestAssigneeForTask(mixed, [], rtb7, [], [{ userId: 1, share: 0.01, overloaded: false }, { userId: 5, share: 0.3, overloaded: false }, { userId: 3, share: 0.25, overloaded: false }]);
    expect(s).toMatchObject({ userId: 3, role: "DEVELOPER" });
  });

  it("no saved report, or no shares: fewest open tasks, then name", () => {
    const tasks = [t(1, 3), t(2, 2)];
    expect(suggestAssigneeForTask(rtb, tasks, rtb7, [], [])).toMatchObject({ userId: 1, reason: "Fewest open tasks" });
    const nulls = rtb.map((m) => ({ userId: m.userId, share: null, overloaded: false }));
    expect(suggestAssigneeForTask(rtb, tasks, rtb7, [], nulls)?.reason).toBe("Fewest open tasks");
  });

  it("everyone overloaded: still a suggestion, never empty", () => {
    const all = rtb.map((m) => ({ userId: m.userId, share: 0.25, overloaded: true }));
    expect(suggestAssigneeForTask(rtb, [], rtb7, [], all)).not.toBeNull();
  });

  it("the card text carries no flag, Gini, band, team health or exclamation words", () => {
    const words = /free[\s-]?rider|overload|gini|band|team health|!/i;
    for (const h of [hints, []]) expect(suggestAssigneeForTask(rtb, [], rtb7, [], h)?.reason).not.toMatch(words);
  });
});

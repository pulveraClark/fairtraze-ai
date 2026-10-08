import { describe, it, expect } from "vitest";
import { suggestAssignee } from "./taskWorkload";

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

import { describe, it, expect } from "vitest";
import { computeWorkload, summarizeGroupTasks, weekRangeIso, type SummaryTask } from "./taskOverviewSummary.js";

// Pure: no database, no network.
const TODAY = "2026-10-18"; // a Sunday
const t = (over: Partial<SummaryTask> = {}): SummaryTask => ({ status: "TODO", assignedToUserId: null, dueDate: null, milestoneId: null, ...over });

describe("weekRangeIso", () => {
  it("is Sunday to Saturday", () => {
    expect(weekRangeIso("2026-10-18")).toEqual({ start: "2026-10-18", end: "2026-10-24" }); // Sunday
    expect(weekRangeIso("2026-10-21")).toEqual({ start: "2026-10-18", end: "2026-10-24" }); // Wednesday
    expect(weekRangeIso("2026-10-24")).toEqual({ start: "2026-10-18", end: "2026-10-24" }); // Saturday
    expect(weekRangeIso("2026-11-01")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
  });
});

describe("computeWorkload", () => {
  const members = [{ userId: 1, name: "Leader Lee" }, { userId: 2, name: "Ben Cruz" }, { userId: 3, name: "Ana Reyes" }];

  it("counts open, overdue, due this week, in review and done per member", () => {
    const w = computeWorkload(7, [
      t({ assignedToUserId: 2, dueDate: "2026-10-10" }),                       // overdue
      t({ assignedToUserId: 2, dueDate: "2026-10-18" }),                       // due today: this week, not overdue
      t({ assignedToUserId: 2, dueDate: "2026-10-24", status: "IN_REVIEW" }),  // Saturday: this week
      t({ assignedToUserId: 2, dueDate: "2026-10-25" }),                       // next week
      t({ assignedToUserId: 2, status: "DONE", dueDate: "2026-10-01" }),       // done and past: not overdue
      t({ assignedToUserId: 3 }),
    ], members, TODAY);
    expect(w.members.find((m) => m.userId === 2)).toEqual({ userId: 2, name: "Ben Cruz", open: 4, overdue: 1, dueThisWeek: 2, inReview: 1, done: 1 });
    expect(w.members.find((m) => m.userId === 3)).toMatchObject({ open: 1, overdue: 0, dueThisWeek: 0 });
    expect(w.members.find((m) => m.userId === 1)).toMatchObject({ open: 0, done: 0 });
    expect(w).toMatchObject({ groupId: 7, today: TODAY });
  });

  it("lists everyone, most open work first, ties by name", () => {
    const w = computeWorkload(7, [t({ assignedToUserId: 3 }), t({ assignedToUserId: 3 }), t({ assignedToUserId: 2 })], members, TODAY);
    expect(w.members.map((m) => m.name)).toEqual(["Ana Reyes", "Ben Cruz", "Leader Lee"]);
    const tied = computeWorkload(7, [], members, TODAY);
    expect(tied.members.map((m) => m.name)).toEqual(["Ana Reyes", "Ben Cruz", "Leader Lee"]);
  });

  it("keeps unassigned work apart and ignores work assigned to someone who left", () => {
    const w = computeWorkload(7, [
      t({ dueDate: "2026-10-01" }), t({}), t({ status: "DONE", dueDate: "2026-10-01" }),
      t({ assignedToUserId: 99, dueDate: "2026-10-01" }),
    ], members, TODAY);
    expect(w.unassigned).toEqual({ open: 2, overdue: 1 });
    expect(w.members.every((m) => m.open === 0)).toBe(true);
  });
});

describe("summarizeGroupTasks", () => {
  it("totals, done, overdue (open and past) and milestone progress in order", () => {
    const s = summarizeGroupTasks(
      { id: 5, groupName: "  " },
      [
        t({ status: "DONE", milestoneId: 1 }), t({ milestoneId: 1, dueDate: "2026-10-01" }), t({ milestoneId: 2 }),
        t({ status: "DONE", dueDate: "2026-09-01" }), t({}),
      ],
      [{ id: 2, name: "Beta", dueDate: null, position: 2 }, { id: 1, name: "Alpha", dueDate: "2026-11-01", position: 1 }],
      TODAY,
    );
    expect(s).toMatchObject({ projectId: 5, groupName: "Group 5", total: 5, done: 2, overdue: 1 });
    expect(s.milestones).toEqual([
      { id: 1, name: "Alpha", dueDate: "2026-11-01", total: 2, done: 1 },
      { id: 2, name: "Beta", dueDate: null, total: 1, done: 0 },
    ]);
  });

  it("a group with no tasks is all zeros", () => {
    expect(summarizeGroupTasks({ id: 1, groupName: "G" }, [], [], TODAY)).toMatchObject({ total: 0, done: 0, overdue: 0, milestones: [] });
  });
});

import { describe, it, expect } from "vitest";
import { addDays, dueBucket, formatDue, isOverdue, todayManila, weekRange } from "./dates";
import { filterTasks, hasAnyFilter, menuFilterCount, NO_FILTERS, statusLine } from "./filters";
import {
  columnsFromTasks, guessPosition, moveInColumns, placementOf, samePlacement, statusOfTask,
} from "./placement";
import { applyMove, denyMessage, removeTaskFrom, replaceTaskIn, withMilestoneCounts } from "./board";
import { moveDeniedMessage } from "./labels";
import { ANA, ASSIGNEE_PERMS, BEN, LEADER, mkBoard, mkTask, NO_PERMS } from "../../../test/taskFixtures";

describe("dates", () => {
  it("uses the school's day (Asia/Manila), not the browser's or UTC's", () => {
    // 20:00 UTC on Oct 15 is already 04:00 on Oct 16 in Manila.
    expect(todayManila(new Date("2026-10-15T20:00:00Z"))).toBe("2026-10-16");
    expect(todayManila(new Date("2026-10-15T10:00:00Z"))).toBe("2026-10-15");
  });

  it("adds days across month ends and computes the Sunday-to-Saturday week", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    // 2026-10-16 is a Friday: the week is Sun 11 - Sat 17.
    expect(weekRange("2026-10-16")).toEqual({ start: "2026-10-11", end: "2026-10-17" });
    expect(weekRange("2026-10-11")).toEqual({ start: "2026-10-11", end: "2026-10-17" }); // a Sunday
    expect(weekRange("2026-10-17")).toEqual({ start: "2026-10-11", end: "2026-10-17" }); // a Saturday
  });

  it("formats a due date without the year in the current year", () => {
    expect(formatDue("2026-11-14", "2026-10-16")).toBe("Nov 14");
    expect(formatDue("2027-01-05", "2026-10-16")).toBe("Jan 5, 2027");
  });

  it("buckets due dates: overdue, this week, later; done tasks are never overdue", () => {
    const today = "2026-10-16";
    expect(dueBucket("2026-10-10", "TODO", today)).toBe("overdue");
    expect(dueBucket("2026-10-10", "DONE", today)).toBeNull();
    expect(dueBucket("2026-10-16", "TODO", today)).toBe("this-week");
    expect(dueBucket("2026-10-17", "IN_PROGRESS", today)).toBe("this-week");
    expect(dueBucket("2026-10-18", "TODO", today)).toBe("later");
    expect(dueBucket(null, "TODO", today)).toBeNull();
    expect(isOverdue("2026-10-15", "IN_REVIEW", today)).toBe(true);
    expect(isOverdue("2026-10-16", "TODO", today)).toBe(false); // due today is not overdue
  });
});

describe("filters", () => {
  const tasks = [
    mkTask({ id: 1, title: "Design the poster", assignedToUserId: 2, priority: "HIGH", labelIds: [10], milestoneId: 5, dueDate: "2026-10-10" }),
    mkTask({ id: 2, title: "Write the report", assignedToUserId: 3, priority: "LOW", dueDate: "2026-10-16", description: "needs a poster mention" }),
    mkTask({ id: 3, title: "Unassigned chore", assignedToUserId: null, priority: "MEDIUM", dueDate: "2026-12-01", status: "IN_PROGRESS" }),
  ];
  const ctx = { userId: 2, today: "2026-10-16" };

  it("returns everything with no filters", () => {
    expect(filterTasks(tasks, NO_FILTERS, ctx)).toHaveLength(3);
    expect(hasAnyFilter(NO_FILTERS)).toBe(false);
  });

  it("searches title, key and description, ignoring case", () => {
    expect(filterTasks(tasks, { ...NO_FILTERS, search: "POSTER" }, ctx).map((t) => t.id)).toEqual([1, 2]);
    expect(filterTasks(tasks, { ...NO_FILTERS, search: "ft-3" }, ctx).map((t) => t.id)).toEqual([3]);
  });

  it("filters by selected members (any of them) and by My tasks", () => {
    expect(filterTasks(tasks, { ...NO_FILTERS, memberIds: [2, 3] }, ctx).map((t) => t.id)).toEqual([1, 2]);
    expect(filterTasks(tasks, { ...NO_FILTERS, memberIds: [3] }, ctx).map((t) => t.id)).toEqual([2]);
    expect(filterTasks(tasks, { ...NO_FILTERS, myTasks: true }, ctx).map((t) => t.id)).toEqual([1]);
  });

  it("filters by priority, label, milestone and due bucket, and combines them", () => {
    expect(filterTasks(tasks, { ...NO_FILTERS, priorities: ["HIGH", "LOW"] }, ctx).map((t) => t.id)).toEqual([1, 2]);
    expect(filterTasks(tasks, { ...NO_FILTERS, labelIds: [10] }, ctx).map((t) => t.id)).toEqual([1]);
    expect(filterTasks(tasks, { ...NO_FILTERS, milestoneId: 5 }, ctx).map((t) => t.id)).toEqual([1]);
    expect(filterTasks(tasks, { ...NO_FILTERS, due: "overdue" }, ctx).map((t) => t.id)).toEqual([1]);
    expect(filterTasks(tasks, { ...NO_FILTERS, due: "this-week" }, ctx).map((t) => t.id)).toEqual([2]);
    expect(filterTasks(tasks, { ...NO_FILTERS, due: "later" }, ctx).map((t) => t.id)).toEqual([3]);
    expect(filterTasks(tasks, { ...NO_FILTERS, memberIds: [2], priorities: ["LOW"] }, ctx)).toEqual([]);
  });

  it("counts only the menu filters for the Filter button badge", () => {
    expect(menuFilterCount({ ...NO_FILTERS, memberIds: [2], myTasks: true, search: "x" })).toBe(0);
    expect(menuFilterCount({ ...NO_FILTERS, priorities: ["HIGH"], due: "later", milestoneId: 3 })).toBe(3);
  });

  it("writes the status line: member names plus 'N of M tasks'", () => {
    const members = [LEADER, BEN, ANA];
    expect(statusLine(NO_FILTERS, members, 8, 8)).toBeNull();
    expect(statusLine({ ...NO_FILTERS, memberIds: [2] }, members, 2, 8)).toBe("Showing tasks for Ben Cruz · 2 of 8 tasks");
    expect(statusLine({ ...NO_FILTERS, memberIds: [2, 3] }, members, 3, 8)).toBe("Showing tasks for Ben Cruz, Ana Reyes · 3 of 8 tasks");
    expect(statusLine({ ...NO_FILTERS, search: "x" }, members, 1, 1)).toBe("Showing 1 of 1 task");
  });
});

describe("placement (drag and drop)", () => {
  const tasks = [
    mkTask({ id: 1, status: "TODO", position: 1024 }),
    mkTask({ id: 2, status: "TODO", position: 2048 }),
    mkTask({ id: 3, status: "TODO", position: 3072 }),
    mkTask({ id: 4, status: "IN_PROGRESS", position: 1024 }),
  ];
  const cols = columnsFromTasks(tasks);

  it("groups ids per column in position order, ties broken by id", () => {
    expect(cols).toEqual({ TODO: [1, 2, 3], IN_PROGRESS: [4], IN_REVIEW: [], DONE: [] });
    const tie = columnsFromTasks([mkTask({ id: 9, position: 5 }), mkTask({ id: 8, position: 5 })]);
    expect(tie.TODO).toEqual([8, 9]);
    expect(statusOfTask(cols, 4)).toBe("IN_PROGRESS");
    expect(statusOfTask(cols, 99)).toBeNull();
  });

  it("describes a card's place as 'after the previous card' (or 'before the next' when first)", () => {
    expect(placementOf(cols, 2)).toEqual({ status: "TODO", afterId: 1, beforeId: null });
    expect(placementOf(cols, 1)).toEqual({ status: "TODO", afterId: null, beforeId: 2 });
    expect(placementOf(cols, 4)).toEqual({ status: "IN_PROGRESS", afterId: null, beforeId: null });
  });

  it("moves a card between columns inside a copy, leaving the original alone", () => {
    const moved = moveInColumns(cols, 1, "IN_PROGRESS", 0);
    expect(moved.TODO).toEqual([2, 3]);
    expect(moved.IN_PROGRESS).toEqual([1, 4]);
    expect(cols.TODO).toEqual([1, 2, 3]);
    expect(moveInColumns(cols, 1, "DONE", 99).DONE).toEqual([1]);
  });

  it("compares placements", () => {
    expect(samePlacement(placementOf(cols, 2), { status: "TODO", afterId: 1, beforeId: null })).toBe(true);
    expect(samePlacement(placementOf(cols, 2), placementOf(cols, 3))).toBe(false);
    expect(samePlacement(null, null)).toBe(false);
  });

  it("guesses a position like the server: midpoint between neighbours, a step past the ends", () => {
    expect(guessPosition(tasks, 3, { status: "TODO", afterId: 1, beforeId: null })).toBe(1536);
    expect(guessPosition(tasks, 1, { status: "TODO", afterId: null, beforeId: 2 })).toBe(2048 - 1024);
    expect(guessPosition(tasks, 1, { status: "TODO", afterId: 3, beforeId: null })).toBe(4096);
    expect(guessPosition(tasks, 1, { status: "DONE", afterId: null, beforeId: null })).toBe(1024);
  });
});

describe("board cache helpers", () => {
  const board = mkBoard({ milestones: [{ id: 5, name: "Alpha", dueDate: null, position: 1, total: 0, done: 0 }] }, [
    mkTask({ id: 1, milestoneId: 5, status: "TODO" }),
    mkTask({ id: 2, milestoneId: 5, status: "DONE" }),
  ]);

  it("recomputes milestone X of Y from the tasks", () => {
    expect(withMilestoneCounts(board).milestones[0]).toMatchObject({ total: 2, done: 1 });
  });

  it("applies a move optimistically (status, done flag, position) and updates the counts", () => {
    const next = applyMove(board, 1, { status: "DONE", afterId: 2, beforeId: null });
    expect(next.tasks.find((t) => t.id === 1)).toMatchObject({ status: "DONE", done: true });
    expect(next.milestones[0]).toMatchObject({ total: 2, done: 2 });
    expect(board.tasks[0]!.status).toBe("TODO"); // original untouched
  });

  it("replaces, adds and removes tasks", () => {
    const replaced = replaceTaskIn(board, mkTask({ id: 1, title: "New title", version: 2, milestoneId: 5 }));
    expect(replaced.tasks.find((t) => t.id === 1)!.title).toBe("New title");
    expect(replaceTaskIn(board, mkTask({ id: 3 })).tasks).toHaveLength(3);
    expect(removeTaskFrom(board, 1).tasks.map((t) => t.id)).toEqual([2]);
  });
});

describe("why a drop or move is refused", () => {
  const mine = mkTask({ id: 1, assignedToUserId: 2, permissions: ASSIGNEE_PERMS });
  const unassigned = mkTask({ id: 2, permissions: NO_PERMS });
  const done = mkTask({ id: 3, assignedToUserId: 2, status: "DONE", permissions: NO_PERMS });

  it("names the assignee and the leader", () => {
    expect(moveDeniedMessage(mkTask({ assignedToUserId: 2 }), [LEADER, BEN, ANA])).toBe("Only Ben Cruz or the group leader can move this task.");
    expect(moveDeniedMessage(unassigned, [LEADER, BEN])).toBe("Only the group leader can move this task.");
    expect(moveDeniedMessage(done, [LEADER, BEN])).toBe("Only the group leader can move a task out of Done.");
  });

  it("explains a refused drop target", () => {
    expect(denyMessage(mine, "DONE", false, "Ben Cruz")).toBe("Only the group leader can mark a task Done.");
    expect(denyMessage(unassigned, "IN_PROGRESS", false, null)).toBe("Only the group leader can move this task.");
    expect(denyMessage(done, "TODO", false, "Ben Cruz")).toBe("Only the group leader can move a task out of Done.");
    expect(denyMessage(mine, "TODO", true, "Ben Cruz")).toBe("");
  });
});

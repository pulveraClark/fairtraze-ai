import { describe, it, expect, afterEach, vi } from "vitest";
import type { BulkAction, BulkEditResponse } from "@shared/taskTypes";
import { addMonths, formatMonth, manilaDateOf, monthGrid, monthOf, todayManila } from "./dates";
import { sortTasks } from "./sort";
import { initialView, parseView, readStoredView, storeView } from "./view";
import { confirmQuestion, needsConfirm, resultMessage } from "./bulk";
import { mkBoard, mkTask, resetFixtureIds } from "../../../test/taskFixtures";

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); resetFixtureIds(); });

describe("Asia/Manila dates around midnight (no off-by-one)", () => {
  it("1 second before and exactly at Manila midnight (16:00 UTC)", () => {
    expect(todayManila(new Date("2026-11-14T15:59:59.000Z"))).toBe("2026-11-14");
    expect(todayManila(new Date("2026-11-14T16:00:00.000Z"))).toBe("2026-11-15");
  });

  it("a deadline stored as 16:00 UTC lands on the next school day", () => {
    expect(manilaDateOf("2026-11-14T16:00:00.000Z")).toBe("2026-11-15");
    expect(manilaDateOf("2026-11-14T15:59:00.000Z")).toBe("2026-11-14");
  });

  it("holds across a month and a year boundary", () => {
    expect(manilaDateOf("2026-12-31T16:00:00.000Z")).toBe("2027-01-01");
    expect(manilaDateOf("2026-10-31T16:30:00.000Z")).toBe("2026-11-01");
  });

  it("the grid never depends on the machine's time zone", () => {
    for (const tz of ["Pacific/Honolulu", "Asia/Manila", "Pacific/Kiritimati"]) {
      vi.stubEnv("TZ", tz);
      const grid = monthGrid("2026-11");
      expect(grid[0]![0]).toBe("2026-11-01");
      expect(grid[5]![6]).toBe("2026-12-12");
    }
    vi.unstubAllEnvs();
  });
});

describe("monthGrid", () => {
  it("is 6 Sunday-first weeks covering the month", () => {
    const grid = monthGrid("2026-11"); // Nov 1, 2026 is a Sunday
    expect(grid).toHaveLength(6);
    for (const week of grid) expect(week).toHaveLength(7);
    expect(grid[0]![0]).toBe("2026-11-01");
    expect(grid.flat()).toContain("2026-11-30");
    expect(new Date(`${grid[2]![0]}T00:00:00Z`).getUTCDay()).toBe(0);
  });

  it("starts in the previous month when the 1st is mid-week, and has Feb 29 in a leap year", () => {
    const feb = monthGrid("2028-02"); // Feb 1, 2028 is a Tuesday
    expect(feb[0]![0]).toBe("2028-01-30");
    expect(feb.flat()).toContain("2028-02-29");
    expect(monthGrid("2027-02").flat()).not.toContain("2027-02-29");
  });

  it("moves months across a year boundary", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthOf("2026-11-14")).toBe("2026-11");
    expect(formatMonth("2026-11")).toBe("November 2026");
  });
});

describe("sortTasks", () => {
  const board = mkBoard({ milestones: [{ id: 5, name: "Beta", dueDate: null, position: 1, total: 0, done: 0 }] });
  const tasks = [
    mkTask({ id: 1, number: 1, title: "banana", dueDate: "2026-11-05", priority: "LOW", assignedToUserId: 3 }),
    mkTask({ id: 2, number: 2, title: "Apple", dueDate: null, priority: "HIGH", assignedToUserId: 2, milestoneId: 5 }),
    mkTask({ id: 3, number: 3, title: "cherry", dueDate: "2026-11-01", priority: "MEDIUM" }),
  ];
  const ids = (key: Parameters<typeof sortTasks>[1]["key"], dir: "asc" | "desc") => sortTasks(tasks, { key, dir }, board).map((t) => t.id);

  it("sorts text case-insensitively and numbers numerically", () => {
    expect(ids("title", "asc")).toEqual([2, 1, 3]);
    expect(ids("key", "desc")).toEqual([3, 2, 1]);
  });

  it("puts High priority first when ascending", () => {
    expect(ids("priority", "asc")).toEqual([2, 3, 1]);
  });

  it("always puts empty values last, in either direction", () => {
    expect(ids("due", "asc")).toEqual([3, 1, 2]);
    expect(ids("due", "desc")).toEqual([1, 3, 2]);
    expect(ids("assignee", "asc").at(-1)).toBe(3); // unassigned
    expect(ids("assignee", "desc").at(-1)).toBe(3);
  });
});

describe("remembered view", () => {
  it("round-trips through localStorage and validates the value", () => {
    storeView(9, "calendar");
    expect(readStoredView(9)).toBe("calendar");
    expect(readStoredView(10)).toBeNull(); // per user
    expect(parseView("nonsense")).toBeNull();
  });

  it("?view= beats the remembered view; default is the board", () => {
    storeView(9, "list");
    expect(initialView(9, "?tab=tasks")).toBe("list");
    expect(initialView(9, "?view=calendar")).toBe("calendar");
    expect(initialView(4, "")).toBe("board");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readStoredView(1)).toBeNull();
    expect(() => storeView(1, "list")).not.toThrow();
    expect(initialView(1, "")).toBe("board");
  });
});

describe("bulk wording", () => {
  const board = mkBoard({ labels: [{ id: 10, name: "frontend", color: "blue" }] });
  const done: BulkAction = { type: "status", status: "DONE" };
  const res = (skipped: BulkEditResponse["skipped"] = []): BulkEditResponse => ({ tasks: [], skipped });

  it("asks only for status and assignee changes", () => {
    expect(needsConfirm(done)).toBe(true);
    expect(needsConfirm({ type: "assign", userId: 2 })).toBe(true);
    expect(needsConfirm({ type: "priority", priority: "HIGH" })).toBe(false);
    expect(needsConfirm({ type: "labels", add: [10] })).toBe(false);
    expect(needsConfirm({ type: "milestone", milestoneId: null })).toBe(false);
  });

  it("words the questions", () => {
    expect(confirmQuestion(done, 5, board)).toBe("Move 5 tasks to Done?");
    expect(confirmQuestion(done, 1, board)).toBe("Move 1 task to Done?");
    expect(confirmQuestion({ type: "assign", userId: 2 }, 5, board)).toBe("Assign 5 tasks to Ben Cruz?");
    expect(confirmQuestion({ type: "assign", userId: null }, 2, board)).toBe("Unassign 2 tasks?");
  });

  it("words the results, including skipped tasks", () => {
    expect(resultMessage(done, 3, res(), board)).toBe("Moved 3 tasks to Done");
    expect(resultMessage(done, 3, res([{ taskId: 1, key: "FT-1", reason: "x" }]), board)).toBe("Moved 2 of 3 tasks to Done. 1 skipped.");
    expect(resultMessage({ type: "labels", add: [10] }, 2, res(), board)).toBe("Added label frontend to 2 tasks");
    expect(resultMessage({ type: "priority", priority: "HIGH" }, 2, res(), board)).toBe("Set High priority on 2 tasks");
  });
});

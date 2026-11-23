import { describe, it, expect, vi, afterEach } from "vitest";
import { NO_FILTERS } from "./filters";
import { parseFilters, pruneFilters, readStoredFilters, storeFilters } from "./filterStore";
import { mkBoard } from "../../../test/taskFixtures";

afterEach(() => { vi.restoreAllMocks(); });

describe("remembered task filters", () => {
  it("round-trips the structured filters but never the search text", () => {
    const f = { ...NO_FILTERS, search: "secret", memberIds: [2], myTasks: true, priorities: ["HIGH" as const], labelIds: [4], milestoneId: 5, due: "overdue" as const };
    storeFilters(1, 7, f);
    expect(window.localStorage.getItem("ft.tasks.filters.1.7")).not.toContain("secret");
    expect(readStoredFilters(1, 7)).toEqual({ ...f, search: "" });
  });

  it("is per user and per group", () => {
    storeFilters(1, 7, { ...NO_FILTERS, myTasks: true });
    expect(readStoredFilters(2, 7)).toEqual(NO_FILTERS);
    expect(readStoredFilters(1, 8)).toEqual(NO_FILTERS);
    expect(readStoredFilters(1, 7).myTasks).toBe(true);
  });

  it("removes the key when nothing but search is active", () => {
    storeFilters(1, 7, { ...NO_FILTERS, myTasks: true });
    storeFilters(1, 7, { ...NO_FILTERS, search: "only search" });
    expect(window.localStorage.getItem("ft.tasks.filters.1.7")).toBeNull();
  });

  it("ignores corrupt or hostile stored values", () => {
    expect(parseFilters("not json")).toEqual(NO_FILTERS);
    expect(parseFilters("null")).toEqual(NO_FILTERS);
    expect(parseFilters(JSON.stringify({ memberIds: ["x", 3], priorities: ["NOPE", "LOW"], due: "someday", milestoneId: "5", myTasks: "yes" })))
      .toEqual({ ...NO_FILTERS, memberIds: [3], priorities: ["LOW"] });
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readStoredFilters(1, 7)).toEqual(NO_FILTERS);
    expect(() => storeFilters(1, 7, { ...NO_FILTERS, myTasks: true })).not.toThrow();
  });

  it("prunes members, labels and milestones that no longer exist", () => {
    const board = mkBoard({ labels: [{ id: 10, name: "frontend", color: "blue" }] });
    const gone = { ...NO_FILTERS, memberIds: [1, 999], labelIds: [10, 77], milestoneId: 42 };
    const pruned = pruneFilters(gone, board);
    expect(pruned.memberIds).toEqual([1]);
    expect(pruned.labelIds).toEqual([10]);
    expect(pruned.milestoneId).toBeNull();
    const clean = { ...NO_FILTERS, labelIds: [10] };
    expect(pruneFilters(clean, board)).toBe(clean);
  });
});

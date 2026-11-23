import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { clearMovePending, markMovePending, PENDING_MOVE_TIMEOUT_MS, usePendingMoveIds } from "./pendingMoves";
import { mkTask, resetFixtureIds } from "../../../test/taskFixtures";

afterEach(() => {
  vi.useRealTimers();
  for (const id of [1, 2]) clearMovePending(1, 7, id);
  resetFixtureIds();
});

describe("usePendingMoveIds", () => {
  it("lists the ids being saved for this group only, and re-renders as moves start and settle", () => {
    const { result } = renderHook(() => usePendingMoveIds(1, 7));
    expect(result.current).toEqual([]);
    act(() => markMovePending(1, 7, mkTask({ id: 2 })));
    act(() => markMovePending(1, 7, mkTask({ id: 1 })));
    expect(result.current).toEqual([1, 2]);
    act(() => markMovePending(1, 8, mkTask({ id: 5 })));
    expect(result.current).toEqual([1, 2]);
    act(() => clearMovePending(1, 7, 1));
    expect(result.current).toEqual([2]);
    act(() => clearMovePending(1, 8, 5));
  });

  it("gives the same array while nothing changed (no render loop)", () => {
    const { result, rerender } = renderHook(() => usePendingMoveIds(1, 7));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("a move that is never answered unlocks its card after 30 seconds, and a repeat mark restarts the clock", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePendingMoveIds(1, 7));
    act(() => markMovePending(1, 7, mkTask({ id: 1 })));
    act(() => { vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS - 1000); });
    expect(result.current).toEqual([1]);
    act(() => markMovePending(1, 7, mkTask({ id: 1 })));
    act(() => { vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS - 1000); });
    expect(result.current).toEqual([1]);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(result.current).toEqual([]);
  });

  it("clearing a move cancels its timer", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePendingMoveIds(1, 7));
    act(() => markMovePending(1, 7, mkTask({ id: 1 })));
    act(() => clearMovePending(1, 7, 1));
    act(() => markMovePending(1, 7, mkTask({ id: 2 })));
    // Task 1's old timer must not fire into task 2's entry.
    act(() => { vi.advanceTimersByTime(PENDING_MOVE_TIMEOUT_MS - 1); });
    expect(result.current).toEqual([2]);
  });
});

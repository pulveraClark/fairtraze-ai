import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePoll } from "./visiblePoll";

let visibility: "visible" | "hidden" = "visible";
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  vi.useRealTimers();
  // @ts-expect-error remove the test override so jsdom's own getter is used again
  delete document.visibilityState;
});

describe("startVisiblePoll", () => {
  it("runs on the interval while the tab is visible", () => {
    const run = vi.fn();
    const stop = startVisiblePoll(run, 15_000);
    vi.advanceTimersByTime(45_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it("makes no request while the tab is hidden, and one at once when it is visible again", () => {
    const run = vi.fn();
    const stop = startVisiblePoll(run, 15_000);
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(10 * 60_000);
    expect(run).not.toHaveBeenCalled();
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it("pulls on window focus and stops completely after cleanup", () => {
    const run = vi.fn();
    const stop = startVisiblePoll(run, 15_000);
    window.dispatchEvent(new Event("focus"));
    expect(run).toHaveBeenCalledTimes(1);
    stop();
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

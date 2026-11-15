import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAiReview } from "./useAiReview";

let visibility: "visible" | "hidden" = "visible";
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // @ts-expect-error remove the test override so jsdom's own getter is used again
  delete document.visibilityState;
});

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("useAiReview: hidden tab", () => {
  it("makes no request while the tab is hidden and polls at once when it is visible again", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ enabled: true, running: true, canGenerate: true, hasReport: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useAiReview(7, "t"));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1); // first read

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing while hidden

    visibility = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2); // catches up immediately

    await advance(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(3); // and the usual 5 s rhythm resumes
  });

  it("still polls every 5 s while visible", async () => {
    const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ enabled: true, running: true, canGenerate: true, hasReport: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useAiReview(7, "t"));
    await advance(0);
    await advance(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { useAutoRefresh } from "./useAutoRefresh";
import { LastAnalyzed } from "../components/LastAnalyzed";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

function setup(over: { request?: () => Promise<boolean>; enabled?: boolean } = {}) {
  const request = vi.fn(over.request ?? (async () => true));
  const refetch = vi.fn(async () => {});
  const hook = renderHook(
    (props: { analyzedAt: string; enabled: boolean }) =>
      useAutoRefresh({ key: 7, enabled: props.enabled, analyzedAt: props.analyzedAt, request, refetch, pollMs: 1000, maxMs: 5000 }),
    { initialProps: { analyzedAt: "old", enabled: over.enabled ?? true } },
  );
  return { request, refetch, ...hook };
}

describe("useAutoRefresh", () => {
  it("asks once per open, only when the report is on screen", async () => {
    const { request, rerender } = setup({ enabled: false });
    await flush();
    expect(request).not.toHaveBeenCalled();
    rerender({ analyzedAt: "old", enabled: true });
    await flush();
    rerender({ analyzedAt: "old", enabled: true });
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("server did not start anything: no 'Updating', no polling", async () => {
    const { result, refetch } = setup({ request: async () => false });
    await flush();
    await advance(10_000);
    expect(result.current.updating).toBe(false);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("shows Updating while it polls, and stops as soon as the new report arrives", async () => {
    const { result, refetch, rerender } = setup();
    await flush();
    expect(result.current.updating).toBe(true);
    await advance(2100);
    expect(refetch).toHaveBeenCalledTimes(2);

    rerender({ analyzedAt: "new", enabled: true });
    await flush();
    expect(result.current.updating).toBe(false);
    const calls = refetch.mock.calls.length;
    await advance(5000);
    expect(refetch.mock.calls.length).toBe(calls);
  });

  it("gives up after the time limit and silently keeps the current report", async () => {
    const { result, refetch } = setup();
    await flush();
    await advance(5500);
    expect(result.current.updating).toBe(false);
    const calls = refetch.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await advance(10_000);
    expect(refetch.mock.calls.length).toBe(calls);
  });

  it("a failing request or re-read never throws or shows an error", async () => {
    const failing = setup({ request: async () => { throw new Error("offline"); } });
    await flush();
    expect(failing.result.current.updating).toBe(false);

    const request = vi.fn(async () => true);
    const refetch = vi.fn(async () => { throw new Error("boom"); });
    const { result } = renderHook(() => useAutoRefresh({ key: 1, enabled: true, analyzedAt: "old", request, refetch, pollMs: 1000, maxMs: 3000 }));
    await flush();
    await advance(3500);
    expect(result.current.updating).toBe(false);
  });
});

describe("LastAnalyzed", () => {
  const iso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  it("shows the line, and 'Updating…' only while updating", () => {
    const { rerender } = render(<LastAnalyzed analyzedAt={iso} trigger="auto" />);
    expect(screen.getByText("Last analyzed 3 hours ago (automatic) · Updates automatically")).toBeTruthy();
    expect(screen.queryByText("Updating…")).toBeNull();
    rerender(<LastAnalyzed analyzedAt={iso} trigger="auto" updating />);
    expect(screen.getByText("Updating…")).toBeTruthy();
  });
});

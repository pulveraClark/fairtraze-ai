import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { adaptiveInterval, useAdaptivePolling } from "./adaptivePolling";

describe("adaptiveInterval", () => {
  it("doubles after every 3 unchanged polls and stops at the cap (10 -> 20 -> 30 s)", () => {
    const at = (n: number) => adaptiveInterval(10_000, 30_000, n);
    expect([0, 1, 2].map(at)).toEqual([10_000, 10_000, 10_000]);
    expect([3, 4, 5].map(at)).toEqual([20_000, 20_000, 20_000]);
    expect([6, 7, 9, 30].map(at)).toEqual([30_000, 30_000, 30_000, 30_000]);
  });
  it("never goes below the base", () => {
    expect(adaptiveInterval(10_000, 30_000, -4)).toBe(10_000);
  });
});

const KEY = ["adaptive-test"];
let client: QueryClient;
let calls: number;
let payload: { v: number };

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

function mount() {
  return renderHook(() => {
    const polling = useAdaptivePolling(KEY, 10_000, 30_000);
    return useQuery({ queryKey: KEY, queryFn: async () => { calls += 1; return { ...payload }; }, retry: false, ...polling });
  }, { wrapper });
}
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  calls = 0;
  payload = { v: 1 };
});
afterEach(() => { client.clear(); vi.useRealTimers(); });

describe("useAdaptivePolling (fake timers)", () => {
  it("quiet board: 10 s x3, then 20 s, then 30 s", async () => {
    mount();
    await advance(0);
    expect(calls).toBe(1); // first load at 0 s
    await advance(30_000);
    expect(calls).toBe(4); // polls at 10, 20, 30 s
    await advance(20_000);
    expect(calls).toBe(5); // next one is 20 s later (50 s)
    await advance(40_000);
    expect(calls).toBe(7); // 70 s, 90 s
    await advance(29_000);
    expect(calls).toBe(7); // now 30 s apart: nothing at 119 s
    await advance(1_000);
    expect(calls).toBe(8); // 120 s
    await advance(30_000);
    expect(calls).toBe(9); // stays at 30 s, never slower
  });

  it("a changed response goes back to 10 s", async () => {
    mount();
    await advance(0);
    await advance(60_000); // slowed down
    const before = calls;
    payload = { v: 2 };
    await advance(30_000); // next poll sees the change
    expect(calls).toBeGreaterThan(before);
    const afterChange = calls;
    await advance(10_000);
    expect(calls).toBe(afterChange + 1); // 10 s again
  });

  it("the user's own write (invalidate) refetches at once and goes back to 10 s", async () => {
    mount();
    await advance(0);
    await advance(100_000); // 30 s apart now
    const before = calls;
    await act(async () => { await client.invalidateQueries({ queryKey: KEY }); });
    expect(calls).toBe(before + 1);
    await advance(10_000);
    expect(calls).toBe(before + 2);
  });

  it("a manual setQueryData (optimistic move) also resets", async () => {
    mount();
    await advance(0);
    await advance(100_000);
    const before = calls;
    act(() => { client.setQueryData(KEY, { v: 9 }); });
    await advance(10_000);
    expect(calls).toBeGreaterThan(before); // polled within 10 s, not 30 s
  });

  it("coming back to the tab (focus) resets to 10 s", async () => {
    mount();
    await advance(0);
    await advance(100_000);
    const before = calls;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); await vi.advanceTimersByTimeAsync(0); });
    expect(calls).toBe(before + 1); // refetch on focus (data is stale)
    await advance(10_000);
    expect(calls).toBe(before + 2); // and the next poll is 10 s later
  });
});

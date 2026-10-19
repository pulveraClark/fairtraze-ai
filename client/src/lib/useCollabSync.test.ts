import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { STILL_CONNECTING_MS, useCollabSync } from "./useCollabSync";
import type { SyncProvider } from "./useCollabSync";

function fakeProvider(synced = false) {
  const listeners = new Set<(s: boolean) => void>();
  const provider: SyncProvider & { emitSync: (s: boolean) => void; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } = {
    synced,
    on: (_e, cb) => void listeners.add(cb),
    off: (_e, cb) => void listeners.delete(cb),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emitSync: (s) => listeners.forEach((cb) => cb(s)),
  };
  return provider;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useCollabSync", () => {
  it("is not synced until the provider says so, then stays synced after a later drop", () => {
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabSync(provider));
    expect(result.current.synced).toBe(false);
    act(() => provider.emitSync(true));
    expect(result.current.synced).toBe(true);
    act(() => provider.emitSync(false));
    expect(result.current.synced).toBe(true);
  });

  it("reports stalled when the document never emits synced, and clears it once it does", () => {
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabSync(provider));
    act(() => { vi.advanceTimersByTime(STILL_CONNECTING_MS - 1); });
    expect(result.current.stalled).toBe(false);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current.stalled).toBe(true);
    expect(result.current.synced).toBe(false);
    act(() => provider.emitSync(true));
    expect(result.current.stalled).toBe(false);
  });

  it("retry reconnects the provider and restarts the wait", () => {
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabSync(provider));
    act(() => { vi.advanceTimersByTime(STILL_CONNECTING_MS + 1); });
    expect(result.current.stalled).toBe(true);
    act(() => result.current.retry());
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
    expect(provider.connect).toHaveBeenCalledTimes(1);
    expect(result.current.stalled).toBe(false);
    act(() => { vi.advanceTimersByTime(STILL_CONNECTING_MS + 1); });
    expect(result.current.stalled).toBe(true);
  });

  it("starts synced when the provider already is", () => {
    const { result } = renderHook(() => useCollabSync(fakeProvider(true)));
    expect(result.current.synced).toBe(true);
    expect(result.current.stalled).toBe(false);
  });
});

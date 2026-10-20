import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSubmitGuard } from "./useSubmitGuard";

describe("useSubmitGuard", () => {
  it("ignores a second call while the first is running, then allows another", async () => {
    const { result } = renderHook(() => useSubmitGuard());
    let release!: () => void;
    const work = vi.fn(() => new Promise<void>((r) => { release = r; }));

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.run(work);
      second = result.current.run(work); // same tick: the ref lock must already be set
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);

    await act(async () => { release(); await first; await second; });
    expect(result.current.submitting).toBe(false);

    await act(async () => { const p = result.current.run(work); release(); await p; });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("releases the lock when the work throws", async () => {
    const { result } = renderHook(() => useSubmitGuard());
    await act(async () => { await result.current.run(async () => { throw new Error("x"); }).catch(() => {}); });
    expect(result.current.submitting).toBe(false);
    const ok = vi.fn(async () => 1);
    await act(async () => { await result.current.run(ok); });
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

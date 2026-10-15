import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { COLLAB_SCHEMA_VERSION, COLLAB_VERSION_CLOSE_CODE } from "@shared/collabVersion";
import { useCollabVersionGuard } from "./useCollabVersionGuard";
import type { GuardedProvider } from "./useCollabVersionGuard";

type CloseCb = (e: { code?: number } | null) => void;

function fakeProvider() {
  const listeners = new Set<CloseCb>();
  const provider: GuardedProvider & { emitClose: (code?: number) => void; disconnect: ReturnType<typeof vi.fn> } = {
    on: (_e, cb) => void listeners.add(cb),
    off: (_e, cb) => void listeners.delete(cb),
    disconnect: vi.fn(),
    emitClose: (code) => listeners.forEach((cb) => cb({ code })),
  };
  return provider;
}

function mockVersion(value: number | "error" | "offline") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (value === "offline") throw new TypeError("network down");
      if (value === "error") return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => ({ collabSchemaVersion: value }) };
    })
  );
}

beforeEach(() => vi.useRealTimers());
afterEach(() => vi.unstubAllGlobals());

describe("useCollabVersionGuard", () => {
  it("stays quiet when the server schema version matches", async () => {
    mockVersion(COLLAB_SCHEMA_VERSION);
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabVersionGuard(provider));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/version"));
    expect(result.current.mismatch).toBe(false);
    expect(provider.disconnect).not.toHaveBeenCalled();
  });

  it("flags a newer deployed schema, disconnects, and sends no more updates", async () => {
    mockVersion(COLLAB_SCHEMA_VERSION + 1);
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabVersionGuard(provider));
    await waitFor(() => expect(result.current.mismatch).toBe(true));
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
  });

  it("flags a refusal from the collab server (close code 4409)", async () => {
    mockVersion(COLLAB_SCHEMA_VERSION);
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabVersionGuard(provider));
    act(() => provider.emitClose(1006)); // an ordinary drop is not a mismatch
    expect(result.current.mismatch).toBe(false);
    act(() => provider.emitClose(COLLAB_VERSION_CLOSE_CODE));
    await waitFor(() => expect(result.current.mismatch).toBe(true));
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects only once even if both signals arrive", async () => {
    mockVersion(COLLAB_SCHEMA_VERSION + 1);
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabVersionGuard(provider));
    await waitFor(() => expect(result.current.mismatch).toBe(true));
    act(() => provider.emitClose(COLLAB_VERSION_CLOSE_CODE));
    expect(provider.disconnect).toHaveBeenCalledTimes(1);
  });

  it("treats an offline or failing version check as no mismatch", async () => {
    for (const v of ["offline", "error"] as const) {
      mockVersion(v);
      const provider = fakeProvider();
      const { result, unmount } = renderHook(() => useCollabVersionGuard(provider));
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(result.current.mismatch).toBe(false);
      expect(provider.disconnect).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("re-checks when the window regains focus", async () => {
    mockVersion(COLLAB_SCHEMA_VERSION);
    const provider = fakeProvider();
    const { result } = renderHook(() => useCollabVersionGuard(provider));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    mockVersion(COLLAB_SCHEMA_VERSION + 1); // a deploy happens while the tab is open
    act(() => void window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(result.current.mismatch).toBe(true));
  });

  it("does nothing without a provider", () => {
    mockVersion(COLLAB_SCHEMA_VERSION + 1);
    const { result } = renderHook(() => useCollabVersionGuard(null));
    expect(result.current.mismatch).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

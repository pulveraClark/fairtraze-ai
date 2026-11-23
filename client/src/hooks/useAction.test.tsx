import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ToastProvider } from "../components/Toast";
import { useAction } from "./useAction";

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;
const OPTS = { success: "Request accepted.", error: "Could not accept the request. Try again." };

afterEach(() => { vi.useRealTimers(); });

describe("useAction", () => {
  it("shows the success toast only after the work finished", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    let release!: () => void;
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(() => new Promise<number>((r) => { release = () => r(1); }), OPTS);
    });
    expect(result.current.busy).toBe(true);
    expect(screen.queryByText("Request accepted.")).not.toBeInTheDocument();
    await act(async () => { release(); await pending; });
    expect(result.current.busy).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("Request accepted.");
  });

  it("shows an error toast and no success toast when the work throws", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    let out: unknown;
    await act(async () => { out = await result.current.run(async () => { throw new Error("The group is full."); }, OPTS); });
    expect(out).toMatchObject({ ok: false });
    expect(screen.getByRole("alert")).toHaveTextContent("The group is full.");
    expect(screen.queryByText("Request accepted.")).not.toBeInTheDocument();
  });

  it("a network failure gives the calm network sentence", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    await act(async () => { await result.current.run(async () => { throw new TypeError("Failed to fetch"); }, OPTS); });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not reach the server.");
  });

  it("a non-ok fetch Response is a failure, never a success", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    await act(async () => {
      await result.current.run(async () => new Response(JSON.stringify({ error: "Only the leader can do this." }), { status: 403 }), OPTS);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Only the leader can do this.");
    expect(screen.queryByText("Request accepted.")).not.toBeInTheDocument();
  });

  it("an ok Response is a success", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    await act(async () => { await result.current.run(async () => new Response("{}", { status: 200 }), OPTS); });
    expect(screen.getByRole("status")).toHaveTextContent("Request accepted.");
  });

  it("success: null means no toast on purpose", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    await act(async () => { await result.current.run(async () => 1, { success: null, error: "x" }); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("onError sends the message to the caller instead of a toast", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    const onError = vi.fn();
    await act(async () => { await result.current.run(async () => { throw new Error("Nope."); }, { ...OPTS, onError }); });
    expect(onError).toHaveBeenCalledWith("Nope.", expect.any(Error));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a second call while the first runs (no double submit)", async () => {
    const { result } = renderHook(() => useAction(), { wrapper });
    const work = vi.fn(() => new Promise<number>(() => {}));
    let second: unknown;
    await act(async () => {
      void result.current.run(work, OPTS);
      second = await result.current.run(work, OPTS);
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ ok: false, skipped: true });
  });

  it("slow turns true after about 3 seconds of waiting and false afterwards", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAction(), { wrapper });
    let release!: () => void;
    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.run(() => new Promise<number>((r) => { release = () => r(1); }), { success: null, error: "x" });
    });
    expect(result.current.slow).toBe(false);
    act(() => { vi.advanceTimersByTime(3100); });
    expect(result.current.slow).toBe(true);
    await act(async () => { release(); await pending; });
    expect(result.current.slow).toBe(false);
  });
});

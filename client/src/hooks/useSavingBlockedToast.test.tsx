import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, act, screen } from "@testing-library/react";
import { ToastProvider } from "../components/Toast";
import { useSavingBlockedToast } from "./useSavingBlockedToast";

afterEach(() => { vi.useRealTimers(); });

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

describe("useSavingBlockedToast", () => {
  it("shows one neutral message however many times a saving card is tried", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSavingBlockedToast(), { wrapper });
    act(() => { result.current(); result.current(); result.current(); });
    expect(screen.getAllByText("Still saving, one moment")).toHaveLength(1);
    // Neutral: a status message, not an error alert.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Still saving, one moment");
  });

  it("can show again once the message has gone", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSavingBlockedToast(), { wrapper });
    act(() => result.current());
    act(() => { vi.advanceTimersByTime(2500); });
    expect(screen.queryByText("Still saving, one moment")).toBeNull();
    act(() => result.current());
    expect(screen.getAllByText("Still saving, one moment")).toHaveLength(1);
  });
});

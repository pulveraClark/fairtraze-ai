import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ onAction }: { onAction?: () => void }) {
  const { showToast, showSuccessToast } = useToast();
  return (
    <>
      <button onClick={() => showSuccessToast("Saved.")}>success</button>
      <button onClick={() => showToast({ message: "Moved FT-1.", actionLabel: "Undo", onAction })}>undo</button>
      <button onClick={() => showToast({ message: "Nope.", tone: "error" })}>error</button>
    </>
  );
}

afterEach(() => { vi.useRealTimers(); });

describe("Toast", () => {
  it("shows a success toast and hides it after ~2 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText("success"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("an action toast stays longer, runs the action once and closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onAction = vi.fn();
    render(<ToastProvider><Trigger onAction={onAction} /></ToastProvider>);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("undo"));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("Moved FT-1.")).toBeInTheDocument(); // still there: it has an Undo to reach

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Moved FT-1.")).not.toBeInTheDocument();
  });

  it("an error toast is announced as an alert and a new toast replaces the old one", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByText("error"));
    expect(screen.getByRole("alert")).toHaveTextContent("Nope.");
    await user.click(screen.getByText("success"));
    expect(screen.queryByText("Nope.")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });
});

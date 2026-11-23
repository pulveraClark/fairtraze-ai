import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ onAction }: { onAction?: () => void }) {
  const { showToast, showSuccessToast, showError } = useToast();
  return (
    <>
      <button onClick={() => showSuccessToast("Saved.")}>success</button>
      <button onClick={() => showToast({ message: "Moved FT-1.", actionLabel: "Undo", onAction })}>undo</button>
      <button onClick={() => showToast({ message: "Nope.", tone: "error" })}>error</button>
      <button onClick={() => showError("Could not save. Try again.")}>showError</button>
      <button onClick={() => { for (let i = 1; i <= 4; i++) showSuccessToast(`Done ${i}.`); }}>four</button>
    </>
  );
}

afterEach(() => { vi.useRealTimers(); });

describe("Toast", () => {
  it("shows a success toast and hides it after ~4 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByText("success"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(700); });
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

  it("an error toast is an alert, lasts 8 seconds and stacks with a newer success toast", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastProvider><Trigger /></ToastProvider>);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("error"));
    expect(screen.getByRole("alert")).toHaveTextContent("Nope.");
    await user.click(screen.getByText("success"));
    expect(screen.getByRole("alert")).toHaveTextContent("Nope.");
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
    expect(screen.getByText("Nope.")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3500); });
    expect(screen.queryByText("Nope.")).not.toBeInTheDocument();
  });

  it("showError raises an error toast", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.setup().click(screen.getByText("showError"));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Try again.");
  });

  it("shows at most 3 toasts; the oldest success leaves first", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.setup().click(screen.getByText("four"));
    expect(screen.queryByText("Done 1.")).not.toBeInTheDocument();
    expect(screen.getByText("Done 2.")).toBeInTheDocument();
    expect(screen.getByText("Done 3.")).toBeInTheDocument();
    expect(screen.getByText("Done 4.")).toBeInTheDocument();
  });

  it("an error and an Undo toast are never pushed out by newer success toasts", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByText("error"));
    await user.click(screen.getByText("undo"));
    await user.click(screen.getByText("four"));
    expect(screen.getByText("Nope.")).toBeInTheDocument();
    expect(screen.getByText("Moved FT-1.")).toBeInTheDocument();
    expect(screen.getAllByRole("status").length + screen.getAllByRole("alert").length).toBe(3);
    expect(screen.getByText("Done 4.")).toBeInTheDocument(); // newest success takes the one free place
  });

  it("when every place is held by errors or Undo, a new success toast gives way", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByText("error"));
    await user.click(screen.getByText("undo"));
    await user.click(screen.getByText("showError"));
    await user.click(screen.getByText("success"));
    expect(screen.getByText("Nope.")).toBeInTheDocument();
    expect(screen.getByText("Moved FT-1.")).toBeInTheDocument();
    expect(screen.getByText("Could not save. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("merges an identical message instead of stacking it, and restarts its timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastProvider><Trigger /></ToastProvider>);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("success"));
    act(() => { vi.advanceTimersByTime(3000); });
    await user.click(screen.getByText("success"));
    expect(screen.getAllByText("Saved.")).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(3000); }); // 6 s since the first, 3 s since the repeat
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("every toast has a Close button that can be reached by keyboard", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByText("success"));
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    expect(close).toHaveFocus();
    expect(close.className).toContain("focus-visible:outline");
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("hovering pauses the timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ToastProvider><Trigger /></ToastProvider>);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText("success"));
    await user.hover(screen.getByRole("status"));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText("Saved.")).toBeInTheDocument();
  });

  it("is one narrow column: the region is flex-col and each toast has a max width", async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    await userEvent.setup().click(screen.getByText("success"));
    const region = document.querySelector("[data-toast-region]")!;
    expect(region.className).toContain("flex-col");
    expect(screen.getByRole("status").className).toContain("max-w-[22rem]");
  });

  it("a toast raised just before navigation is still shown on the next screen", async () => {
    function Screens() {
      const [screenName, setScreen] = useState<"group" | "home">("group");
      const { showSuccessToast } = useToast();
      return screenName === "group" ? (
        <button onClick={() => { showSuccessToast("You left the group."); setScreen("home"); }}>leave</button>
      ) : (
        <h1>Home</h1>
      );
    }
    render(<ToastProvider><Screens /></ToastProvider>);
    await userEvent.setup().click(screen.getByText("leave"));
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You left the group.");
  });
});

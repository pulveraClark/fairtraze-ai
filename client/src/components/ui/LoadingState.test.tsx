import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LoadingState, SlowNote } from "./LoadingState";
import { BusyLabel } from "./BusyLabel";
import { SLOW_TEXT } from "../../lib/feedback";

afterEach(() => { vi.useRealTimers(); });

describe("LoadingState", () => {
  it("is a status region with a label and adds the shared slow line after ~3 seconds", () => {
    vi.useFakeTimers();
    render(<LoadingState label="Loading classes…" className="min-h-32" />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Loading classes…");
    expect(region.className).toContain("min-h-32");
    expect(screen.queryByText(SLOW_TEXT)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.getByText(SLOW_TEXT)).toBeInTheDocument();
  });

  it("defaults to a plain Loading… label", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });
});

describe("SlowNote", () => {
  it("shows the slow line only when asked", () => {
    const { rerender } = render(<SlowNote show={false} />);
    expect(screen.queryByText(SLOW_TEXT)).not.toBeInTheDocument();
    rerender(<SlowNote show />);
    expect(screen.getByText(SLOW_TEXT)).toBeInTheDocument();
  });
});

describe("BusyLabel", () => {
  it("shows the idle text, or a spinner with the busy text", () => {
    const { rerender, container } = render(<BusyLabel busy={false} idle="Save" busyText="Saving…" />);
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(container.querySelector("[data-spinner]")).toBeNull();
    rerender(<BusyLabel busy idle="Save" busyText="Saving…" />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(container.querySelector("[data-spinner]")).not.toBeNull();
  });
});

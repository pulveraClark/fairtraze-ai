import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AnalyzedAgo } from "./AnalyzedAgo";

describe("AnalyzedAgo", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("reads 'Last analyzed 3 hours ago' with the exact Manila date and time as the tooltip", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    render(<AnalyzedAgo iso="2026-10-20T09:00:00Z" />);
    const el = screen.getByText("Last analyzed 3 hours ago");
    expect(el).toHaveAttribute("title", "Oct 20, 2026, 5:00 PM");
  });

  it("re-reads the clock every minute so an open card does not stay on 'just now'", () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    render(<AnalyzedAgo iso="2026-10-20T12:00:00Z" />);
    expect(screen.getByText("Last analyzed just now")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5 * 60_000); });
    expect(screen.getByText("Last analyzed 5 minutes ago")).toBeInTheDocument();
  });
});

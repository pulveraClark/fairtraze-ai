import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RefreshFailedNote } from "./RefreshFailedNote";
import { refreshFailedLine, type AiRefreshNote } from "../lib/aiReview";

afterEach(() => { vi.useRealTimers(); });

const timeout: AiRefreshNote = { at: "2026-10-27T10:00:00Z", shownFrom: "2026-10-26T09:00:00Z", errorCode: "AI_TIMEOUT" };

describe("refreshFailedLine", () => {
  it("says the check could not be refreshed and which check is shown", () => {
    const line = refreshFailedLine(timeout, new Date("2026-10-27T11:00:00Z"));
    expect(line).toMatch(/^The last check could not be refreshed\. Showing the check from [A-Z][a-z]{2} \d{1,2}\.$/);
  });
  it("adds the daily-limit sentence only for the daily limit", () => {
    const daily = { ...timeout, errorCode: "AI_QUOTA_DAILY", retryAt: "2026-10-27T15:00:00Z" };
    expect(refreshFailedLine(daily, new Date("2026-10-27T11:00:00Z"))).toMatch(/daily limit was reached\. It is available again around/);
    expect(refreshFailedLine(timeout, new Date("2026-10-27T11:00:00Z"))).not.toMatch(/daily limit/);
  });
});

describe("RefreshFailedNote", () => {
  it("shows the note and a Try again button that works for another failure", async () => {
    const onTryAgain = vi.fn();
    render(<RefreshFailedNote note={timeout} onTryAgain={onTryAgain} />);
    expect(screen.getByRole("status").textContent).toMatch(/could not be refreshed/);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("has no button for a viewer who cannot generate (the leader)", () => {
    render(<RefreshFailedNote note={timeout} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps Try again disabled until the daily limit resets, then enables it", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-27T11:00:00Z") });
    const note = { ...timeout, errorCode: "AI_QUOTA_DAILY", retryAt: "2026-10-27T13:00:00Z" };
    render(<RefreshFailedNote note={note} onTryAgain={() => {}} />);
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 3_600_000 + 2000); });
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("is disabled while a run is in progress", () => {
    render(<RefreshFailedNote note={timeout} onTryAgain={() => {}} busy />);
    expect((screen.getByRole("button", { name: "Try again" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

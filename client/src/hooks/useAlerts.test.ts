import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { timeAgo } from "./useAlerts";

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps under a minute old", () => {
    expect(timeAgo(new Date("2026-08-18T11:59:30.000Z").toISOString())).toBe("just now");
  });

  it("returns minutes for timestamps under an hour old", () => {
    expect(timeAgo(new Date("2026-08-18T11:45:00.000Z").toISOString())).toBe("15m ago");
  });

  it("returns hours for timestamps under a day old", () => {
    expect(timeAgo(new Date("2026-08-18T09:00:00.000Z").toISOString())).toBe("3h ago");
  });

  it("returns days for timestamps under a week old", () => {
    expect(timeAgo(new Date("2026-08-15T12:00:00.000Z").toISOString())).toBe("3d ago");
  });

  it("falls back to a formatted date for timestamps a week or older", () => {
    const result = timeAgo(new Date("2026-08-01T12:00:00.000Z").toISOString());
    expect(result).toBe("Aug 1");
  });
});

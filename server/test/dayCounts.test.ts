import { describe, it, expect } from "vitest";
import { countByDay } from "../src/lib/dayCounts.js";

describe("countByDay", () => {
  it("buckets by Asia/Manila calendar day, not UTC", () => {
    // 17:00Z is already 01:00 the next day in Manila (UTC+8); 15:59Z is still the same day.
    expect(countByDay(["2026-01-01T17:00:00Z", "2026-01-01T15:59:00Z"])).toEqual([
      { d: "2026-01-01", n: 1 },
      { d: "2026-01-02", n: 1 },
    ]);
  });

  it("counts several events on one day, sorts oldest first and skips invalid dates", () => {
    expect(countByDay(["2026-03-05T02:00:00Z", "nope", "2026-03-04T02:00:00Z", "2026-03-05T05:00:00Z"])).toEqual([
      { d: "2026-03-04", n: 1 },
      { d: "2026-03-05", n: 2 },
    ]);
  });
});

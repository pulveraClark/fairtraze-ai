import { describe, expect, it } from "vitest";
import { formatLastAnalyzed, formatLastAnalyzedStudent, relativeTime } from "./analysisFreshness";

const NOW = new Date("2026-10-26T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("relativeTime", () => {
  it("speaks in minutes, hours and days", () => {
    expect(relativeTime(ago(10_000), NOW)).toBe("just now");
    expect(relativeTime(ago(MIN), NOW)).toBe("1 minute ago");
    expect(relativeTime(ago(45 * MIN), NOW)).toBe("45 minutes ago");
    expect(relativeTime(ago(HOUR), NOW)).toBe("1 hour ago");
    expect(relativeTime(ago(3 * HOUR + 20 * MIN), NOW)).toBe("3 hours ago");
    expect(relativeTime(ago(49 * HOUR), NOW)).toBe("2 days ago");
  });
  it("never reads as the future", () => {
    expect(relativeTime(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBe("just now");
  });
});

describe("formatLastAnalyzed", () => {
  it("reads 'Last analyzed 3 hours ago · Updates automatically'", () => {
    expect(formatLastAnalyzed(ago(3 * HOUR), null, NOW)).toBe("Last analyzed 3 hours ago · Updates automatically");
    expect(formatLastAnalyzed(ago(3 * HOUR), undefined, NOW)).toBe("Last analyzed 3 hours ago · Updates automatically");
  });
  it("says who started it when that is known", () => {
    expect(formatLastAnalyzed(ago(3 * HOUR), "auto", NOW)).toBe("Last analyzed 3 hours ago (automatic) · Updates automatically");
    expect(formatLastAnalyzed(ago(3 * HOUR), "manual", NOW)).toBe("Last analyzed 3 hours ago (manual) · Updates automatically");
  });
  it("does not say 'every night' (it also refreshes when a report is opened)", () => {
    expect(formatLastAnalyzed(ago(HOUR), "auto", NOW)).not.toMatch(/night/i);
  });
});

describe("student last-analyzed line", () => {
  it("reads 'Last analyzed 14 hours ago. Updates every night.'", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(formatLastAnalyzedStudent("2026-10-26T22:00:00Z", now)).toBe("Last analyzed 14 hours ago. Updates every night.");
  });
});

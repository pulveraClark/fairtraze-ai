import { describe, expect, it } from "vitest";
import { formatLastAnalyzed, isAutoAnalysisClosed, formatLastAnalyzedStudent, formatLastAnalyzedUpdateFailed, formatLastAnalyzedShort, formatAnalyzedExact, AUTO_UPDATE_FAILED_TEXT, relativeTime } from "./analysisFreshness";

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

const ACTIVE_TAIL = "Re-analyzes automatically when there is new activity";
const DAY = 24 * HOUR;

describe("isAutoAnalysisClosed (same 7-day rule as the server)", () => {
  const deadline = "2026-10-19T12:00:00Z";
  it("is open with no, or an unreadable, deadline", () => {
    expect(isAutoAnalysisClosed(null, NOW)).toBe(false);
    expect(isAutoAnalysisClosed(undefined, NOW)).toBe(false);
    expect(isAutoAnalysisClosed("not a date", NOW)).toBe(false);
  });
  it("stays open exactly 7 days after the deadline and closes 1 ms later", () => {
    const edge = new Date(new Date(deadline).getTime() + 7 * DAY);
    expect(isAutoAnalysisClosed(deadline, edge)).toBe(false);
    expect(isAutoAnalysisClosed(deadline, new Date(edge.getTime() + 1))).toBe(true);
  });
  it("is open before the deadline", () => {
    expect(isAutoAnalysisClosed("2026-11-30T00:00:00Z", NOW)).toBe(false);
  });
});

describe("formatLastAnalyzed", () => {
  it("reads 'Last analyzed 3 hours ago · Re-analyzes automatically when there is new activity'", () => {
    expect(formatLastAnalyzed(ago(3 * HOUR), null, NOW)).toBe(`Last analyzed 3 hours ago · ${ACTIVE_TAIL}`);
    expect(formatLastAnalyzed(ago(3 * HOUR), undefined, NOW)).toBe(`Last analyzed 3 hours ago · ${ACTIVE_TAIL}`);
  });
  it("says who started it when that is known", () => {
    expect(formatLastAnalyzed(ago(3 * HOUR), "auto", NOW)).toBe(`Last analyzed 3 hours ago (automatic) · ${ACTIVE_TAIL}`);
    expect(formatLastAnalyzed(ago(3 * HOUR), "manual", NOW)).toBe(`Last analyzed 3 hours ago (manual) · ${ACTIVE_TAIL}`);
  });
  it("once closed, says it is final and drops the trigger label", () => {
    expect(formatLastAnalyzed(ago(15 * DAY), "manual", NOW, true)).toBe("Last analyzed 15 days ago · Final report, no more automatic updates");
  });
  it("never says 'Updates automatically'", () => {
    expect(formatLastAnalyzed(ago(HOUR), "auto", NOW)).not.toMatch(/Updates automatically/);
  });
  it("does not say 'every night' (it also refreshes when a report is opened)", () => {
    expect(formatLastAnalyzed(ago(HOUR), "auto", NOW)).not.toMatch(/night/i);
  });
});

describe("short form for lists and cards", () => {
  it("reads 'Last analyzed 3 hours ago' with no update status", () => {
    expect(formatLastAnalyzedShort(ago(3 * HOUR), NOW)).toBe("Last analyzed 3 hours ago");
    expect(formatLastAnalyzedShort(ago(30_000), NOW)).toBe("Last analyzed just now");
    expect(formatLastAnalyzedShort(ago(2 * 24 * HOUR), NOW)).toBe("Last analyzed 2 days ago");
  });
  it("gives the exact date and time on the Manila clock, so a late-evening time is the right day", () => {
    expect(formatAnalyzedExact("2026-10-19T15:45:00Z")).toBe("Oct 19, 2026, 11:45 PM");
    expect(formatAnalyzedExact("2026-10-19T16:30:00Z")).toBe("Oct 20, 2026, 12:30 AM");
  });
});

describe("when the latest automatic update did not finish", () => {
  it("says so in one calm sentence, for everyone, without a cause or blame", () => {
    expect(formatLastAnalyzedUpdateFailed(ago(3 * 24 * HOUR), NOW)).toBe("Last analyzed 3 days ago. The latest update didn't finish. It will try again tonight.");
    expect(AUTO_UPDATE_FAILED_TEXT).toBe("The latest update didn't finish. It will try again tonight.");
  });
});

describe("student last-analyzed line", () => {
  it("reads 'Last analyzed 14 hours ago. Updates again when there is new activity.'", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(formatLastAnalyzedStudent("2026-10-26T22:00:00Z", now)).toBe("Last analyzed 14 hours ago. Updates again when there is new activity.");
  });
  it("once closed, says it is final", () => {
    expect(formatLastAnalyzedStudent(ago(15 * DAY), NOW, true)).toBe("Last analyzed 15 days ago. Final report, no more updates.");
  });
  it("mentions no scores or Gini", () => {
    expect(formatLastAnalyzedStudent(ago(HOUR), NOW)).not.toMatch(/score|gini/i);
    expect(formatLastAnalyzedStudent(ago(HOUR), NOW, true)).not.toMatch(/score|gini/i);
  });
});

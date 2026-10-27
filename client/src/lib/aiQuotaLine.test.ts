import { describe, it, expect } from "vitest";
import { quotaResetLine, quotaStillBlocked, reviewStatusLine, briefStatusLine, type AiReviewResponse } from "./aiReview";

const now = new Date("2026-10-27T11:00:00Z");

describe("quotaResetLine", () => {
  it("gives the reset time on the viewer's clock and the hours", () => {
    const line = quotaResetLine("2026-10-27T15:00:00Z", now, "UTC");
    expect(line).toMatch(/^The AI's daily limit was reached\. It is available again around 3:00\sPM \(in about 4 hours\)\.$/);
  });
  it("uses the viewer's time zone, not the server's", () => {
    expect(quotaResetLine("2026-10-27T15:00:00Z", now, "Asia/Manila")).toMatch(/11:00\sPM/);
  });
  it("says 1 hour in the singular and rounds partial hours up", () => {
    expect(quotaResetLine("2026-10-27T11:20:00Z", now, "UTC")).toMatch(/in about 1 hour\)/);
    expect(quotaResetLine("2026-10-27T13:01:00Z", now, "UTC")).toMatch(/in about 3 hours\)/);
  });
  it("leaves the time out when it is unknown, invalid or already past", () => {
    for (const v of [null, undefined, "", "soon", "2026-10-27T10:00:00Z"]) {
      expect(quotaResetLine(v, now, "UTC")).toBe("The AI's daily limit was reached. Try again later.");
    }
  });
});

describe("quotaStillBlocked", () => {
  it("is true only before the reset time", () => {
    expect(quotaStillBlocked("2026-10-27T15:00:00Z", now)).toBe(true);
    expect(quotaStillBlocked("2026-10-27T10:00:00Z", now)).toBe(false);
    expect(quotaStillBlocked(null, now)).toBe(false);
  });
});

describe("status lines with a daily limit", () => {
  const base: AiReviewResponse = { enabled: true, summaries: [], aiLimit: { retryAt: "2026-10-27T15:00:00Z" } };
  it("replaces the generic failure text for member findings and keeps the file-list note", () => {
    const line = reviewStatusLine({ ...base, status: "FAILED" }, now)!;
    expect(line).toMatch(/daily limit was reached/);
    expect(line).toMatch(/Changed files are shown instead\.$/);
    expect(line).not.toMatch(/unavailable/);
  });
  it("replaces the generic failure text for the instructions check", () => {
    expect(briefStatusLine({ ...base, briefFailed: true }, now)).toMatch(/daily limit was reached/);
  });
});

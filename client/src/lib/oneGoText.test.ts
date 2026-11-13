import { describe, it, expect } from "vitest";
import { oneGoDayLabel, oneGoLine, ONE_GO_TIP, ONE_GO_HISTORY_BUTTON } from "./oneGoText";

describe("oneGoText", () => {
  it("formats the Manila day without a time zone shift", () => {
    expect(oneGoDayLabel("2026-11-10")).toBe("Nov 10");
    expect(oneGoDayLabel("2026-01-01")).toBe("Jan 1");
    expect(oneGoDayLabel("2026-12-31")).toBe("Dec 31");
    expect(oneGoDayLabel("garbage")).toBeNull();
    expect(oneGoDayLabel(undefined)).toBeNull();
  });
  it("reads as a request to check, with the date", () => {
    expect(oneGoLine("2026-11-10")).toBe(
      "Worth a look: a large part of this member's text was added in one go on Nov 10. Please compare snapshots in the document history."
    );
    expect(oneGoLine(null)).not.toMatch(/ on /);
  });
  it("never uses accusing words or a character count", () => {
    for (const s of [oneGoLine("2026-11-10"), ONE_GO_TIP, ONE_GO_HISTORY_BUTTON]) {
      expect(s).not.toMatch(/past(e|ed|ing)\b|cheat|suspicious|plagiar/i);
    }
    expect(oneGoLine("2026-11-10")).not.toMatch(/\d{3,}/);
    expect(ONE_GO_TIP).toMatch(/one snapshot per analysis run/);
  });
});

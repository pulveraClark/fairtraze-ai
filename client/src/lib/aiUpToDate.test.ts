import { describe, it, expect } from "vitest";
import { upToDateLine, formatSince } from "./aiReview";

describe("formatSince", () => {
  it("writes the date and time on the viewer's clock", () => {
    expect(formatSince("2026-10-27T15:00:00Z", "UTC")).toMatch(/^Oct 27, 3:00\sPM$/);
    expect(formatSince("2026-10-27T15:00:00Z", "Asia/Manila")).toMatch(/^Oct 27, 11:00\sPM$/);
    expect(formatSince(null)).toBeNull();
    expect(formatSince("nope")).toBeNull();
  });
});

describe("upToDateLine", () => {
  const nar = "2026-10-27T15:00:00Z";
  it("says nothing changed when the explanation is unchanged and AI review is off", () => {
    expect(upToDateLine(nar, false, undefined, "UTC")).toMatch(/^Already up to date\. Nothing changed since Oct 27, 3:00\sPM\.$/);
  });
  it("with AI review on, needs the findings to be unchanged too, and uses the most recent time", () => {
    expect(upToDateLine(nar, true, undefined, "UTC")).toBeNull();
    expect(upToDateLine(nar, true, "2026-10-27T16:30:00Z", "UTC")).toMatch(/4:30\sPM/);
    expect(upToDateLine(nar, true, "2026-10-27T10:00:00Z", "UTC")).toMatch(/3:00\sPM/);
  });
  it("says nothing when the explanation was regenerated", () => {
    expect(upToDateLine(null, false, "2026-10-27T16:30:00Z")).toBeNull();
  });
});

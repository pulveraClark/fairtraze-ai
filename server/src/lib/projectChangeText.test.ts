import { describe, it, expect } from "vitest";
import { buildProjectChangeMessage, formatDeadline, kindsOf, maskOf, CHANGE_BITS, type ChangeKind } from "./projectChangeText.js";

const NOW = new Date("2026-11-15T04:00:00Z");
const ALL: ChangeKind[] = ["text", "files", "deadline", "name", "groupSize", "scoring"];

describe("project change wording", () => {
  it("gives each single change its own plain sentence", () => {
    const detail = { title: "Capstone Sprint", deadline: new Date("2026-11-20T09:00:00Z"), maxGroupSize: 5 };
    const say = (k: ChangeKind) => buildProjectChangeMessage(maskOf([k]), detail, NOW);
    expect(say("text")).toBe("Your instructor updated the project instructions.");
    expect(say("files")).toBe("Your instructor changed the files attached to the instructions.");
    expect(say("deadline")).toBe("The deadline changed. It is now Nov 20, 5:00 PM.");
    expect(say("name")).toBe("The project was renamed to “Capstone Sprint”.");
    expect(say("groupSize")).toBe("The group size limit is now 5.");
    expect(say("scoring")).toBe("Your instructor updated the scoring settings. Reports update the next time they are analyzed.");
  });

  it("scoring notice is generic: no digits, no scoring vocabulary", () => {
    // Detail that looks like settings must never leak into the scoring sentence.
    const text = buildProjectChangeMessage(maskOf(["scoring"]), { maxGroupSize: 5 }, NOW);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/gini|threshold|weight|band|health|%|share/i);
  });

  it("merges two or more changes into one short generic line, in a fixed order", () => {
    const text = buildProjectChangeMessage(maskOf(["scoring", "deadline", "text"]), { deadline: new Date(), maxGroupSize: 7 }, NOW);
    expect(text).toBe("Your instructor made 3 changes to the project: instructions, deadline, scoring settings. Open your group to see them.");
    // The merged line does not repeat a value that an older save may have replaced.
    expect(text).not.toMatch(/\d{1,2}:\d{2}| 7\b/);
  });

  it("stays short even when everything changed", () => {
    const text = buildProjectChangeMessage(maskOf(ALL), {}, NOW);
    expect(text.length).toBeLessThan(200);
    expect(text).toContain("6 changes");
  });

  it("falls back to a detail-free sentence when no detail is given", () => {
    expect(buildProjectChangeMessage(maskOf(["deadline"]), {}, NOW)).toBe("The deadline changed. Open your group to see the new date.");
    expect(buildProjectChangeMessage(maskOf(["name"]), {}, NOW)).toBe("The project was renamed.");
    expect(buildProjectChangeMessage(maskOf(["groupSize"]), {}, NOW)).toBe("The group size limit changed.");
  });

  it("shows the year only when it differs from the current year (Manila time)", () => {
    expect(formatDeadline(new Date("2026-11-20T09:00:00Z"), NOW)).toBe("Nov 20, 5:00 PM");
    expect(formatDeadline(new Date("2027-01-05T09:00:00Z"), NOW)).toBe("Jan 5, 2027, 5:00 PM");
    // 17:00 UTC on 31 Dec is already 1 Jan in Manila, so a 2026 "now" sees 2027.
    expect(formatDeadline(new Date("2026-12-31T17:00:00Z"), NOW)).toContain("2027");
    // The reverse: it is already 2027 in Manila, so a 2026 deadline needs its year.
    expect(formatDeadline(new Date("2026-11-20T09:00:00Z"), new Date("2026-12-31T17:00:00Z"))).toContain("2026");
  });

  it("bit helpers round-trip and each kind has its own bit", () => {
    expect(new Set(Object.values(CHANGE_BITS)).size).toBe(ALL.length);
    expect(kindsOf(maskOf(ALL))).toEqual(ALL);
    expect(kindsOf(0)).toEqual([]);
  });
});

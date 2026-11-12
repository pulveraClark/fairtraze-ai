import { describe, it, expect } from "vitest";
import { contributionStatus } from "./contributionStatus.js";

describe("contributionStatus", () => {
  it("is Fair when nobody has a flag (also for an empty group)", () => {
    expect(contributionStatus([{ flags: [] }, { flags: [] }])).toBe("Fair");
    expect(contributionStatus([])).toBe("Fair");
  });
  it("counts members with at least one flag, not flags", () => {
    expect(contributionStatus([{ flags: ["overload"] }, { flags: [] }, { flags: ["free-rider", "deadline-driven"] }]))
      .toBe("Needs review (2 of 3 flagged)");
  });
  it("works when everyone is flagged", () => {
    expect(contributionStatus([{ flags: ["inactive"] }])).toBe("Needs review (1 of 1 flagged)");
  });
});

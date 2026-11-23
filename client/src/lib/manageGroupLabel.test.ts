import { describe, expect, it } from "vitest";
import { manageGroupLabel, pendingTotal } from "./manageGroupLabel";

describe("pendingTotal", () => {
  it("adds join requests and role requests", () => {
    expect(pendingTotal({ joinRequests: 2, roleRequests: 3 })).toBe(5);
  });
  it("is 0 without counts (a plain member) and never negative", () => {
    expect(pendingTotal(undefined)).toBe(0);
    expect(pendingTotal(null)).toBe(0);
    expect(pendingTotal({ joinRequests: -1, roleRequests: 0 })).toBe(0);
  });
});

describe("manageGroupLabel", () => {
  it("zero = plain name, no number", () => {
    expect(manageGroupLabel(0)).toBe("Manage Group");
  });
  it("singular and plural", () => {
    expect(manageGroupLabel(1)).toBe("Manage Group, 1 pending request");
    expect(manageGroupLabel(4)).toBe("Manage Group, 4 pending requests");
  });
});

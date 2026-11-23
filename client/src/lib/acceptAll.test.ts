import { describe, it, expect } from "vitest";
import { planAcceptAll } from "./acceptAll";

describe("planAcceptAll", () => {
  it("accepts everyone when they all fit", () => {
    expect(planAcceptAll(3, 1, 5)).toMatchObject({ accepting: 3, leftOver: 0, title: "Accept 3 requests?", detail: null });
  });
  it("uses the singular for one request", () => {
    expect(planAcceptAll(1, 1, 5).title).toBe("Accept 1 request?");
  });
  it("respects the member limit and says what stays pending", () => {
    const p = planAcceptAll(4, 3, 5);
    expect(p).toMatchObject({ accepting: 2, leftOver: 2, title: "Accept 2 requests?" });
    expect(p.detail).toBe("Only 2 fit (limit 5). The oldest 2 will be accepted; 2 will stay pending.");
  });
  it("has no limit when the assignment sets none", () => {
    expect(planAcceptAll(6, 2, null)).toMatchObject({ accepting: 6, leftOver: 0 });
  });
  it("accepts nothing in a full group", () => {
    expect(planAcceptAll(2, 5, 5)).toMatchObject({ accepting: 0, leftOver: 2, title: "The group is full" });
  });
});

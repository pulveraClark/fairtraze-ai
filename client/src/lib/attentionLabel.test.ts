import { describe, it, expect } from "vitest";
import { groupsNeedAttention } from "./attentionLabel";

describe("groupsNeedAttention (I34)", () => {
  it("uses the right verb for one group and for several", () => {
    expect(groupsNeedAttention(1)).toBe("1 group needs attention");
    expect(groupsNeedAttention(4)).toBe("4 groups need attention");
    expect(groupsNeedAttention(0)).toBe("0 groups need attention");
  });
});

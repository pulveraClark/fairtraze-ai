import { describe, it, expect } from "vitest";
import { classifyEdit, EDIT_TYPE_WEIGHT } from "./editClassifier";

// ── classifyEdit ────────────────────────────────────────────────────────────

describe("classifyEdit", () => {
  it("classifies a long pure insertion as substantive (typing a full paragraph)", () => {
    expect(classifyEdit({ insertLength: 250, deleteLength: 0 })).toBe("substantive");
  });

  it("classifies a short pure insertion as revision (a modest new addition, not brand-new-paragraph-sized)", () => {
    expect(classifyEdit({ insertLength: 12, deleteLength: 0 })).toBe("revision");
  });

  it("classifies a tiny total change as trivial (fixing a typo)", () => {
    // total = 1 + 1 = 2 <= TRIVIAL_MAX_CHARS
    expect(classifyEdit({ insertLength: 1, deleteLength: 1 })).toBe("trivial");
  });

  it("classifies a tiny pure insertion as trivial (single punctuation mark)", () => {
    expect(classifyEdit({ insertLength: 1, deleteLength: 0 })).toBe("trivial");
  });

  it("classifies a similar-length replace as formatting (reordering/restructuring existing text)", () => {
    // ratio 40/38 ≈ 1.05, within [0.5, 1.5]
    expect(classifyEdit({ insertLength: 40, deleteLength: 38 })).toBe("formatting");
  });

  it("classifies a skewed-length replace with modest new text as revision (a real rewrite)", () => {
    // ratio 10/40 = 0.25, outside [0.5, 1.5]; insertLength below substantive threshold
    expect(classifyEdit({ insertLength: 10, deleteLength: 40 })).toBe("revision");
  });

  it("classifies a skewed-length replace with a lot of new text as substantive (expanding into new material)", () => {
    // ratio 200/20 = 10, outside [0.5, 1.5]; insertLength above substantive threshold
    expect(classifyEdit({ insertLength: 200, deleteLength: 20 })).toBe("substantive");
  });

  it("weights are ordered substantive > revision > formatting > trivial", () => {
    expect(EDIT_TYPE_WEIGHT.substantive).toBeGreaterThan(EDIT_TYPE_WEIGHT.revision);
    expect(EDIT_TYPE_WEIGHT.revision).toBeGreaterThan(EDIT_TYPE_WEIGHT.formatting);
    expect(EDIT_TYPE_WEIGHT.formatting).toBeGreaterThan(EDIT_TYPE_WEIGHT.trivial);
  });
});

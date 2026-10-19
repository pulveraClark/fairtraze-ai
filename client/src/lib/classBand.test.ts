import { describe, it, expect } from "vitest";
import { CLASS_BAND_BACKGROUND } from "./classBand";

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

describe("class card band", () => {
  it("is a single flat colour, not a gradient or a per-class palette", () => {
    expect(CLASS_BAND_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("keeps white text at 4.5:1 or better", () => {
    expect((1.05) / (luminance(CLASS_BAND_BACKGROUND) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

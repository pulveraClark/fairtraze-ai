import { describe, it, expect } from "vitest";
import { CLASS_ACCENTS, classAccent } from "./classBand";

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe("class accent", () => {
  it("is the same colour for the same class, every time", () => {
    expect(classAccent(7)).toEqual(classAccent(7));
  });
  it("gives neighbouring classes different colours and uses the whole palette", () => {
    for (let id = 1; id < 40; id++) expect(classAccent(id).color).not.toBe(classAccent(id + 1).color);
    expect(new Set(Array.from({ length: 6 }, (_, i) => classAccent(i + 1).name)).size).toBe(6);
  });
  it("always returns a palette colour, even for odd ids", () => {
    for (const id of [0, -3, 2.7, NaN, 1e9]) expect(CLASS_ACCENTS.map((a) => a.color)).toContain(classAccent(id).color);
  });
  it("is limited to cool hues, never the risk colours (red, orange, amber, yellow, green)", () => {
    expect(CLASS_ACCENTS.map((a) => a.name)).toEqual(["blue", "indigo", "teal", "violet", "slate", "cyan"]);
    for (const { name, color } of CLASS_ACCENTS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      if (name === "slate") continue; // neutral
      const h = hue(color);
      // Teal sits at ~175deg, cyan ~190deg; green starts below ~150deg and red/orange/yellow are below 70deg.
      expect(h, name).toBeGreaterThanOrEqual(170);
      expect(h, name).toBeLessThanOrEqual(280);
    }
  });
  it("keeps white text at 4.5:1 or better on every accent", () => {
    for (const { name, color } of CLASS_ACCENTS) expect(1.05 / (luminance(color) + 0.05), name).toBeGreaterThanOrEqual(4.5);
  });
});

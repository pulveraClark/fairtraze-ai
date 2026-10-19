import { describe, it, expect } from "vitest";
import { flyoutPosition } from "./flyoutPosition";

describe("flyoutPosition (22)", () => {
  it("lines up with the trigger on a tall screen and caps the height to what is left below it", () => {
    const p = flyoutPosition({ top: 100, right: 240 }, { width: 1280, height: 900 });
    expect(p).toEqual({ left: 248, top: 100, maxHeight: 900 - 100 - 8 });
  });

  it("moves up when a trigger near the bottom would push the flyout off screen", () => {
    const p = flyoutPosition({ top: 800, right: 240 }, { width: 1280, height: 900 });
    expect(p.top).toBe(900 - 480 - 8);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(900 - 8);
  });

  it("on a short window it starts at the top margin and scrolls inside, never taller than the viewport", () => {
    const p = flyoutPosition({ top: 300, right: 240 }, { width: 1280, height: 400 });
    expect(p.top).toBe(8);
    expect(p.maxHeight).toBe(400 - 8 - 8);
  });

  it("stays inside the width on a narrow screen", () => {
    const p = flyoutPosition({ top: 50, right: 300 }, { width: 375, height: 700 });
    const width = Math.min(352, 375 - 24);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + width).toBeLessThanOrEqual(375 - 8);
  });

  it("always keeps the whole flyout within the viewport", () => {
    for (const height of [320, 480, 700, 1080]) {
      for (const top of [0, 150, 500, 900]) {
        const p = flyoutPosition({ top, right: 240 }, { width: 1280, height });
        expect(p.top).toBeGreaterThanOrEqual(8);
        expect(p.top + p.maxHeight).toBeLessThanOrEqual(Math.max(height - 8, p.top + 120));
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { MARGIN_PRESETS, PAGE_SIZE_KEYS, resolvePageGeometry } from "./pageSizes";

describe("resolvePageGeometry", () => {
  it("keeps portrait as defined and swaps width and height for landscape", () => {
    for (const key of PAGE_SIZE_KEYS) {
      const p = resolvePageGeometry(key, "PORTRAIT", "NORMAL");
      const l = resolvePageGeometry(key, "LANDSCAPE", "NORMAL");
      expect(l.widthPx).toBe(p.heightPx);
      expect(l.heightPx).toBe(p.widthPx);
      expect(l.cssWidth).toBe(p.cssHeight);
      expect(l.cssHeight).toBe(p.cssWidth);
      expect(l.widthTwip).toBe(p.heightTwip);
      expect(l.heightTwip).toBe(p.widthTwip);
      expect(l.landscape).toBe(true);
      expect(p.landscape).toBe(false);
    }
  });

  it("defaults to Short, portrait, 1 inch margins", () => {
    expect(resolvePageGeometry("SHORT")).toMatchObject({
      widthPx: 816, heightPx: 1056, marginTopPx: 96, marginBottomPx: 96, marginLeftPx: 96, marginRightPx: 96,
    });
  });

  it("defines the three margin presets from the spec", () => {
    expect(MARGIN_PRESETS.NORMAL).toMatchObject({ topPx: 96, bottomPx: 96, leftPx: 96, rightPx: 96 });
    expect(MARGIN_PRESETS.NARROW).toMatchObject({ topPx: 48, bottomPx: 48, leftPx: 48, rightPx: 48 });
    expect(MARGIN_PRESETS.WIDE).toMatchObject({ topPx: 96, bottomPx: 96, leftPx: 192, rightPx: 192 });
  });

  it("margins do not change with orientation", () => {
    const l = resolvePageGeometry("A4", "LANDSCAPE", "WIDE");
    expect([l.marginTopPx, l.marginBottomPx, l.marginLeftPx, l.marginRightPx]).toEqual([96, 96, 192, 192]);
  });
});

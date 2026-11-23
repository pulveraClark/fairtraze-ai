import { describe, expect, it } from "vitest";
import {
  MARGIN_PRESETS,
  PAGE_SIZES,
  PAGE_SIZE_KEYS,
  normalizePageSizeKey,
  resolveMargins,
  resolvePageGeometry,
  validateMargins,
} from "./pageSizes";

describe("paper sizes", () => {
  it("uses the standard names and dimensions (Letter 8.5x11, Legal 8.5x14, A4)", () => {
    expect(PAGE_SIZE_KEYS).toEqual(["LETTER", "LEGAL", "A4"]);
    expect(PAGE_SIZES.LETTER).toMatchObject({ label: "Letter (8.5 × 11 in)", widthPx: 816, heightPx: 1056, cssHeight: "11in", heightTwip: 15840 });
    expect(PAGE_SIZES.LEGAL).toMatchObject({ label: "Legal (8.5 × 14 in)", widthPx: 816, heightPx: 1344, cssHeight: "14in", heightTwip: 20160 });
    expect(PAGE_SIZES.A4).toMatchObject({ label: "A4 (210 × 297 mm)", widthPx: 794, heightPx: 1123, cssWidth: "210mm" });
  });

  it("maps the legacy keys for the deploy window only", () => {
    expect(normalizePageSizeKey("SHORT")).toBe("LETTER");
    expect(normalizePageSizeKey("LONG")).toBe("LEGAL");
    expect(normalizePageSizeKey("A4")).toBe("A4");
    expect(normalizePageSizeKey("HUGE")).toBeNull();
  });
});

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

  it("defaults to Letter, portrait, 1 inch margins", () => {
    expect(resolvePageGeometry("LETTER")).toMatchObject({
      widthPx: 816, heightPx: 1056, marginTopPx: 96, marginBottomPx: 96, marginLeftPx: 96, marginRightPx: 96,
    });
  });

  it("defines the three margin presets from the spec, in inches", () => {
    expect(MARGIN_PRESETS.NORMAL).toMatchObject({ top: 1, bottom: 1, left: 1, right: 1 });
    expect(MARGIN_PRESETS.NARROW).toMatchObject({ top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 });
    expect(MARGIN_PRESETS.WIDE).toMatchObject({ top: 1, bottom: 1, left: 2, right: 2 });
  });

  it("margins do not change with orientation", () => {
    const l = resolvePageGeometry("A4", "LANDSCAPE", "WIDE");
    expect([l.marginTopPx, l.marginBottomPx, l.marginLeftPx, l.marginRightPx]).toEqual([96, 96, 192, 192]);
  });

  it("uses the four custom values (inches) for CUSTOM", () => {
    const g = resolvePageGeometry("LETTER", "PORTRAIT", "CUSTOM", { top: 1, bottom: 1, left: 0.5, right: 1 });
    expect([g.marginTopPx, g.marginBottomPx, g.marginLeftPx, g.marginRightPx]).toEqual([96, 96, 48, 96]);
    expect(resolveMargins("WIDE", { top: 3, bottom: 3, left: 3, right: 3 })).toMatchObject({ left: 2 }); // presets ignore custom
  });
});

describe("validateMargins", () => {
  const ok = { size: "LETTER", orientation: "PORTRAIT", margins: { top: 1, bottom: 1, left: 1, right: 1 } } as const;

  it("accepts every preset on every paper and orientation", () => {
    for (const size of PAGE_SIZE_KEYS) for (const orientation of ["PORTRAIT", "LANDSCAPE"] as const) {
      for (const preset of ["NORMAL", "NARROW", "WIDE"] as const) {
        expect(validateMargins({ size, orientation, margins: resolveMargins(preset) }), `${size} ${orientation} ${preset}`).toBeNull();
      }
    }
  });

  it("accepts 0 and 3 in, rejects outside 0 to 3 and off-step values", () => {
    expect(validateMargins({ ...ok, margins: { top: 0, bottom: 0, left: 0, right: 0 } })).toBeNull();
    expect(validateMargins({ ...ok, margins: { top: 3, bottom: 3, left: 3, right: 3 } })).toBeNull();
    expect(validateMargins({ ...ok, margins: { ...ok.margins, top: 3.1 } })).toMatch(/Top margin must be between 0 and 3/);
    expect(validateMargins({ ...ok, margins: { ...ok.margins, left: -0.1 } })).toMatch(/Left margin must be between/);
    expect(validateMargins({ ...ok, margins: { ...ok.margins, right: 0.15 } })).toMatch(/Right margin must be a multiple of 0.1/);
    expect(validateMargins({ ...ok, margins: { ...ok.margins, bottom: Number.NaN } })).toMatch(/Bottom margin must be a number/);
    expect(validateMargins({ ...ok, margins: { ...ok.margins, bottom: 0.3 } })).toBeNull(); // 0.1 steps have float noise; must still pass
    expect(validateMargins({ ...ok, margins: { ...ok.margins, left: 0.7 } })).toBeNull();
  });

  it("needs at least 2 in of writing width and height", () => {
    // Letter portrait is 8.5 wide: 3 + 3.5 would be too much, but the range stops at 3 -> 2.5 left (ok).
    expect(validateMargins({ ...ok, margins: { top: 1, bottom: 1, left: 3, right: 3 } })).toBeNull();
    // A4 landscape is 8.27 in high: 3 + 3 leaves 2.27 (ok); with a header and a footer (0.6 in) it does not.
    const a4l = { size: "A4", orientation: "LANDSCAPE", margins: { top: 3, bottom: 3, left: 1, right: 1 } } as const;
    expect(validateMargins(a4l)).toBeNull();
    expect(validateMargins({ ...a4l, hasHeader: true, hasFooter: true })).toMatch(/writing height; at least 2 in is needed/);
    expect(validateMargins({ ...a4l, hasHeader: true })).toMatch(/leave 1\.97 in/); // 8.27 - 6 - 0.3
    // Letter landscape is 8.5 in high: 3 + 3 + header + footer still leaves 1.9 in -> rejected; 2.5 without.
    expect(validateMargins({ size: "LETTER", orientation: "LANDSCAPE", margins: { top: 3, bottom: 3, left: 1, right: 1 } })).toBeNull();
  });

  it("reports the remaining space in the message", () => {
    const msg = validateMargins({ size: "A4", orientation: "LANDSCAPE", margins: { top: 3, bottom: 3, left: 1, right: 1 }, hasHeader: true, hasFooter: true });
    expect(msg).toMatch(/leave 1\.67 in/);
  });
});

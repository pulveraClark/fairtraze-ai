import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SETUP, parsePageSetup, samePageSetup } from "./pageSetup";

describe("parsePageSetup", () => {
  it("reads a full server payload", () => {
    const p = parsePageSetup({
      pageSize: "A4",
      orientation: "LANDSCAPE",
      marginPreset: "WIDE",
      header: { left: "L", center: "C", right: "R" },
      footer: { left: "", center: "{page}", right: "" },
    });
    expect(p).toEqual({
      pageSize: "A4",
      orientation: "LANDSCAPE",
      marginPreset: "WIDE",
      header: { left: "L", center: "C", right: "R" },
      footer: { left: "", center: "{page}", right: "" },
    });
  });

  it("falls back to defaults for unknown values and missing text", () => {
    const p = parsePageSetup({ pageSize: "LONG", orientation: "DIAGONAL", marginPreset: 7, header: null });
    expect(p).toEqual({ ...DEFAULT_PAGE_SETUP, pageSize: "LONG" });
  });

  it("rejects a payload without a valid paper size", () => {
    expect(parsePageSetup(null)).toBeNull();
    expect(parsePageSetup({})).toBeNull();
    expect(parsePageSetup({ pageSize: "HUGE" })).toBeNull();
  });

  it("compares setups field by field", () => {
    const a = { ...DEFAULT_PAGE_SETUP };
    expect(samePageSetup(a, { ...DEFAULT_PAGE_SETUP })).toBe(true);
    expect(samePageSetup(a, { ...a, orientation: "LANDSCAPE" })).toBe(false);
    expect(samePageSetup(a, { ...a, footer: { left: "", center: "x", right: "" } })).toBe(false);
  });
});

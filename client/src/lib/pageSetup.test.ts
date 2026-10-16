import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SETUP, mergePageSetup, pageSetupPatchBody, parsePageSetup, samePageSetup } from "./pageSetup";

describe("parsePageSetup", () => {
  it("reads a full server payload", () => {
    const p = parsePageSetup({
      pageSize: "A4",
      orientation: "LANDSCAPE",
      marginPreset: "WIDE",
      margins: { top: 1, bottom: 1, left: 2, right: 2 },
      header: { left: "L", center: "C", right: "R" },
      footer: { left: "", center: "{page}", right: "" },
    });
    expect(p).toEqual({
      pageSize: "A4",
      orientation: "LANDSCAPE",
      marginPreset: "WIDE",
      margins: { top: 1, bottom: 1, left: 2, right: 2 },
      header: { left: "L", center: "C", right: "R" },
      footer: { left: "", center: "{page}", right: "" },
    });
  });

  it("falls back to defaults for unknown values and missing text", () => {
    const p = parsePageSetup({ pageSize: "LEGAL", orientation: "DIAGONAL", marginPreset: 7, header: null });
    expect(p).toEqual({ ...DEFAULT_PAGE_SETUP, pageSize: "LEGAL" });
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

  it("maps the old paper keys during the deploy window (SHORT -> LETTER, LONG -> LEGAL)", () => {
    expect(parsePageSetup({ pageSize: "SHORT" })?.pageSize).toBe("LETTER");
    expect(parsePageSetup({ pageSize: "LONG" })?.pageSize).toBe("LEGAL");
  });

  it("reads custom margins, and falls back to the preset when the numbers are missing or invalid", () => {
    const custom = parsePageSetup({ pageSize: "A4", marginPreset: "CUSTOM", margins: { top: 1, bottom: 1, left: 0.5, right: 1 } });
    expect(custom?.margins).toEqual({ top: 1, bottom: 1, left: 0.5, right: 1 });
    expect(parsePageSetup({ pageSize: "A4", marginPreset: "NARROW" })?.margins).toEqual({ top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 });
    expect(parsePageSetup({ pageSize: "A4", marginPreset: "CUSTOM", margins: { top: "x" } })?.margins).toEqual({ top: 1, bottom: 1, left: 1, right: 1 });
    // A named preset always wins over stray numbers.
    expect(parsePageSetup({ pageSize: "A4", marginPreset: "WIDE", margins: { top: 3, bottom: 3, left: 3, right: 3 } })?.margins).toEqual({ top: 1, bottom: 1, left: 2, right: 2 });
  });

  it("compares margins too", () => {
    expect(samePageSetup(DEFAULT_PAGE_SETUP, { ...DEFAULT_PAGE_SETUP, margins: { top: 1, bottom: 1, left: 1, right: 1.1 } })).toBe(false);
  });

  it("builds the PATCH body: a preset sends only its name, CUSTOM sends the four numbers", () => {
    expect(pageSetupPatchBody({ marginPreset: "NARROW", margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } })).toEqual({ marginPreset: "NARROW" });
    expect(pageSetupPatchBody({ pageSize: "A4", marginPreset: "CUSTOM", margins: { top: 1, bottom: 1, left: 0.5, right: 1 } })).toEqual({
      pageSize: "A4", marginPreset: "CUSTOM", marginTop: 1, marginBottom: 1, marginLeft: 0.5, marginRight: 1,
    });
    expect(pageSetupPatchBody({ header: { left: "x", center: "", right: "" } })).toEqual({ header: { left: "x", center: "", right: "" } });
  });

  it("merges an optimistic change: a preset fills its numbers", () => {
    expect(mergePageSetup(DEFAULT_PAGE_SETUP, { marginPreset: "WIDE" })).toMatchObject({ marginPreset: "WIDE", margins: { left: 2, right: 2 } });
    expect(mergePageSetup(DEFAULT_PAGE_SETUP, { orientation: "LANDSCAPE" })).toMatchObject({ marginPreset: "NORMAL", orientation: "LANDSCAPE" });
  });
});

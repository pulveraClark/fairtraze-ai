import { describe, it, expect } from "vitest";
import { contrastRatio } from "./contrast";

// Tailwind default palette values for the pairs used by the join-request controls, as they are today
// (checked: all >= 4.5:1; Decline's red-600 on the amber row is the tightest at ~4.66:1). Disabled controls are exempt.
// (GroupManageModal Accept / Decline on the amber request row; StudentClassPage request states).
const C = {
  white: "#ffffff",
  amber50: "#fffbeb", amber700: "#b45309", amber800: "#92400e",
  emerald50: "#ecfdf5", emerald700: "#047857", emerald900: "#064e3b",
  red50: "#fef2f2", red600: "#dc2626", red700: "#b91c1c", red800: "#991b1b",
  indigo600: "#4f46e5",
};

const PAIRS: Array<[string, string, string]> = [
  ["Accept (resting): text-emerald-700 on amber-50 row", C.emerald700, C.amber50],
  ["Accept (hover): text-emerald-900 on emerald-50", C.emerald900, C.emerald50],
  ["Decline (resting): text-red-600 on amber-50 row", C.red600, C.amber50],
  ["Decline (hover): text-red-800 on red-50", C.red800, C.red50],
  ["Cancel request: text-amber-700 on amber-50", C.amber700, C.amber50],
  ["Request pending text: text-amber-800 on amber-50", C.amber800, C.amber50],
  ["Declined box: text-red-700 on red-50", C.red700, C.red50],
  ["Primary button: white on indigo-600", C.white, C.indigo600],
];

describe("contrastRatio", () => {
  it("matches known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
});

describe("join-request control colours", () => {
  it.each(PAIRS)("%s is at least 4.5:1", (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

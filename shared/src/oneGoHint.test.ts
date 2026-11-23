import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ONE_GO_MIN_CHARS, oneGoHintApplies } from "./oneGoHint";

describe("oneGoHintApplies", () => {
  it("needs an insert of at least 800 characters", () => {
    expect(ONE_GO_MIN_CHARS).toBe(800);
    expect(oneGoHintApplies(799, 799)).toBe(false);
    expect(oneGoHintApplies(ONE_GO_MIN_CHARS, 800)).toBe(true);
  });
  it("the 60% rule applies at the new minimum", () => {
    expect(oneGoHintApplies(800, 1333)).toBe(true);  // 800 is 60.01% of 1333
    expect(oneGoHintApplies(800, 1334)).toBe(false); // 59.97%
  });
  it("needs the insert to be at least 60% of retained text", () => {
    expect(oneGoHintApplies(1800, 3000)).toBe(true); // exactly 60%
    expect(oneGoHintApplies(1799, 3000)).toBe(false);
  });
  it("ignores a paste that was later mostly deleted (retained under half of it)", () => {
    expect(oneGoHintApplies(4000, 1999)).toBe(false);
    expect(oneGoHintApplies(4000, 2000)).toBe(true);
  });
  it("never applies with no text or bad numbers", () => {
    expect(oneGoHintApplies(0, 0)).toBe(false);
    expect(oneGoHintApplies(2000, 0)).toBe(false);
    expect(oneGoHintApplies(NaN, 100)).toBe(false);
  });
  it("is not imported by any scoring file", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f === "oneGoHint.ts") continue;
      expect(readFileSync(join(dir, f), "utf8"), f).not.toMatch(/oneGoHint/);
    }
  });
});

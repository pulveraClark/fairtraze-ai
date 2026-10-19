import { describe, it, expect } from "vitest";
import { HELP_ANCHORS, SETTINGS_TIPS, TIPS, helpLink } from "./helpText";

function allTips(): string[] {
  const out: string[] = [];
  for (const v of Object.values(TIPS)) out.push(typeof v === "function" ? (v as (...a: number[]) => string)(33.3, 3) : v);
  out.push(...Object.values(SETTINGS_TIPS));
  return out;
}

describe("helpText", () => {
  it("keeps every tooltip to one or two plain sentences", () => {
    for (const t of allTips()) {
      const sentences = t.match(/(?<!\s)[.!?](\s|$)/g) ?? [];
      expect(sentences.length, t).toBeGreaterThanOrEqual(1);
      expect(sentences.length, t).toBeLessThanOrEqual(2);
      expect(t.length, t).toBeLessThanOrEqual(240);
    }
  });

  it("never mentions the Gini value in tips that students can see (the app hides it from them)", () => {
    for (const t of Object.values(TIPS)) {
      const text = typeof t === "function" ? (t as (...a: number[]) => string)(33.3, 3) : t;
      expect(text).not.toMatch(/gini/i);
    }
  });

  it("builds Help links from the known anchors", () => {
    expect(helpLink("shares")).toBe("/help#shares");
    expect(new Set(HELP_ANCHORS).size).toBe(HELP_ANCHORS.length);
  });
});

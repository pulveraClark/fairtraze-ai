import { describe, it, expect } from "vitest";
import { balanceWeights } from "./balanceWeights";

const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 1000) / 1000;

describe("balanceWeights", () => {
  it("scales proportionally to exactly 1.00", () => {
    expect(balanceWeights([0.4, 0.4, 0.1])).toEqual([0.45, 0.44, 0.11]);
    expect(balanceWeights([0.6, 0.6])).toEqual([0.5, 0.5]);
    expect(balanceWeights([0.2, 0.2, 0.2])).toEqual([0.34, 0.33, 0.33]);
  });
  it("keeps the order of the weights and always totals 1", () => {
    for (const v of [[0.1, 0.9, 0.3], [1, 1, 1], [0.05, 0.05, 0.05], [0.7, 0.01, 0.01]]) {
      const out = balanceWeights(v);
      expect(sum(out)).toBe(1);
      out.forEach((x) => expect(x).toBeGreaterThanOrEqual(0));
    }
    const [a, b, c] = balanceWeights([0.1, 0.5, 0.2]);
    expect(b!).toBeGreaterThan(c!);
    expect(c!).toBeGreaterThan(a!);
  });
  it("splits equally when everything is zero", () => {
    expect(balanceWeights([0, 0])).toEqual([0.5, 0.5]);
    expect(sum(balanceWeights([0, 0, 0]))).toBe(1);
  });
  it("handles an empty list", () => {
    expect(balanceWeights([])).toEqual([]);
  });
});

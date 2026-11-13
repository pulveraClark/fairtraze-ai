import { describe, it, expect, vi } from "vitest";
import {
  DOCUMENT_DEFAULT_WEIGHTS, DEFAULT_BLEND_WEIGHTS, weightsAreValid, resolveDocumentWeights, resolveBlendWeights,
} from "./weights";

describe("default weights (expert survey, AHP)", () => {
  it("Docs defaults are 0.37 / 0.30 / 0.33 and add up to 1", () => {
    expect(DOCUMENT_DEFAULT_WEIGHTS).toEqual({ retainedText: 0.37, sessions: 0.30, activeDays: 0.33 });
    expect(weightsAreValid(Object.values(DOCUMENT_DEFAULT_WEIGHTS))).toBe(true);
  });
  it("blend defaults are GitHub 0.55 / Docs 0.45", () => {
    expect(DEFAULT_BLEND_WEIGHTS).toEqual({ wGitHub: 0.55, wDocs: 0.45 });
  });
});

describe("weightsAreValid", () => {
  it("accepts a set that adds up to 1.00 (within 0.001)", () => {
    expect(weightsAreValid([0.5, 0.5])).toBe(true);
    expect(weightsAreValid([0.3333, 0.3333, 0.3334])).toBe(true);
  });
  it("rejects wrong sums, out-of-range, NaN, Infinity and non-numbers", () => {
    expect(weightsAreValid([0.5, 0.45])).toBe(false);
    expect(weightsAreValid([1.5, -0.5])).toBe(false);
    expect(weightsAreValid([NaN, 1])).toBe(false);
    expect(weightsAreValid([Infinity, 0])).toBe(false);
    expect(weightsAreValid(["0.5", 0.5])).toBe(false);
  });
});

describe("resolve*Weights", () => {
  it("returns valid input unchanged, without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = { retainedText: 0.5, sessions: 0.25, activeDays: 0.25 };
    expect(resolveDocumentWeights(w)).toBe(w);
    const b = { wGitHub: 0.7, wDocs: 0.3 };
    expect(resolveBlendWeights(b)).toBe(b);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("uses the defaults for null/undefined without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveDocumentWeights(undefined)).toBe(DOCUMENT_DEFAULT_WEIGHTS);
    expect(resolveBlendWeights(null)).toBe(DEFAULT_BLEND_WEIGHTS);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
  it("replaces an invalid set as a whole (no rescaling), warns, and never throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveDocumentWeights({ retainedText: 0.5, sessions: 0.3, activeDays: 0.15 })).toBe(DOCUMENT_DEFAULT_WEIGHTS);
    expect(resolveBlendWeights({ wGitHub: 0.9, wDocs: 0.9 })).toBe(DEFAULT_BLEND_WEIGHTS);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0]![0])).not.toMatch(/[0-9]{3,}/); // no values or ids in the message
    warn.mockRestore();
  });
});

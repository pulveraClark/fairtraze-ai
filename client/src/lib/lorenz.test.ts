import { describe, it, expect } from "vitest";
import { lorenzPoints, lowestHalf } from "./lorenz";

describe("lorenzPoints", () => {
  it("is the diagonal for equal shares", () => {
    const pts = lorenzPoints([0.25, 0.25, 0.25, 0.25]);
    expect(pts).toHaveLength(5);
    pts.forEach((p) => expect(p.y).toBeCloseTo(p.x));
  });

  it("sorts lowest first and accumulates to (1, 1)", () => {
    const pts = lorenzPoints([0.6, 0.1, 0.3]);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[1].y).toBeCloseTo(0.1);
    expect(pts[2].y).toBeCloseTo(0.4);
    expect(pts[3]).toEqual({ x: 1, y: expect.closeTo(1) });
  });

  it("does not mutate its input", () => {
    const input = [0.5, 0.2, 0.3];
    lorenzPoints(input);
    expect(input).toEqual([0.5, 0.2, 0.3]);
  });

  it("handles a single member, no members, and an all-zero split", () => {
    expect(lorenzPoints([1])).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(lorenzPoints([])).toEqual([{ x: 0, y: 0 }]);
    expect(lorenzPoints([0, 0])[2].y).toBeCloseTo(1);
  });
});

describe("lowestHalf", () => {
  it("reports the share held by the lowest floor(n/2) members", () => {
    const h = lowestHalf([0.1, 0.1, 0.3, 0.5])!;
    expect(h).toMatchObject({ count: 2, of: 4, equalShare: 0.5 });
    expect(h.share).toBeCloseTo(0.2);
  });
  it("is null for fewer than two members", () => {
    expect(lowestHalf([1])).toBeNull();
  });
});

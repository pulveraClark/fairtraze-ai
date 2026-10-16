import { describe, it, expect } from "vitest";
import { computePosition, rebalanced, POSITION_STEP } from "./taskPosition.js";

const col = (...positions: number[]) => positions.map((position, i) => ({ id: i + 1, position }));

describe("computePosition", () => {
  it("starts an empty column at one step", () => {
    expect(computePosition([], {})).toEqual({ position: POSITION_STEP, needsRebalance: false });
  });
  it("appends to the end when no neighbour is given", () => {
    expect(computePosition(col(1024, 2048), {})!.position).toBe(3072);
  });
  it("goes right after a card: midpoint to the next one, or one step past the last", () => {
    expect(computePosition(col(1024, 2048), { afterId: 1 })!.position).toBe(1536);
    expect(computePosition(col(1024, 2048), { afterId: 2 })!.position).toBe(3072);
  });
  it("goes right before a card: midpoint to the previous one, or one step before the first", () => {
    expect(computePosition(col(1024, 2048), { beforeId: 2 })!.position).toBe(1536);
    expect(computePosition(col(1024, 2048), { beforeId: 1 })!.position).toBe(0);
  });
  it("returns null when the neighbour is not in the column", () => {
    expect(computePosition(col(1024), { afterId: 99 })).toBeNull();
    expect(computePosition(col(1024), { beforeId: 99 })).toBeNull();
  });
  it("asks for a renumber when the gap is too small", () => {
    expect(computePosition(col(1, 1 + 1e-7), { afterId: 1 })!.needsRebalance).toBe(true);
    expect(computePosition(col(1, 2), { afterId: 1 })!.needsRebalance).toBe(false);
  });
  it("sorts consistently after repeated halving then a rebalance", () => {
    let column = col(1024, 2048);
    for (let i = 0; i < 40; i++) {
      const placed = computePosition(column, { afterId: 1 })!;
      if (placed.needsRebalance) { column = rebalanced(column); continue; }
      column = [column[0]!, { id: 100 + i, position: placed.position }, ...column.slice(1)];
    }
    const positions = column.map((c) => c.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("rebalanced", () => {
  it("renumbers in order, one step apart", () => {
    expect(rebalanced(col(5, 5.0000001, 9))).toEqual([
      { id: 1, position: 1024 }, { id: 2, position: 2048 }, { id: 3, position: 3072 },
    ]);
  });
});

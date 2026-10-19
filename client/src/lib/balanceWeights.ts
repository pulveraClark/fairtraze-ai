/**
 * Scales non-negative values proportionally so they add up to exactly 1.00 at two decimals
 * (largest-remainder rounding). All zeros become an equal split. Used only by the scoring settings
 * form to fix a total that is off; it never touches the scoring maths or the default values.
 */
export function balanceWeights(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = safe.reduce((a, b) => a + b, 0);
  const shares = total > 0 ? safe.map((v) => (v / total) * 100) : safe.map(() => 100 / n);
  const floors = shares.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = shares.map((s, i) => ({ i, frac: s - floors[i]! })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors.map((f) => f / 100);
}

// Display-only helpers for the Lorenz curve card. These never produce a Gini, a score or a flag —
// the report's stored values are the only source of those.

export interface LorenzPoint {
  /** Cumulative fraction of members, lowest contributor first (0–1). */
  x: number;
  /** Cumulative fraction of total contribution held by those members (0–1). */
  y: number;
}

export function lorenzPoints(shares: number[]): LorenzPoint[] {
  const n = shares.length;
  if (n === 0) return [{ x: 0, y: 0 }];
  const sorted = [...shares].sort((a, b) => a - b);
  const total = sorted.reduce((s, v) => s + v, 0);
  const points: LorenzPoint[] = [{ x: 0, y: 0 }];
  let running = 0;
  sorted.forEach((v, i) => {
    running += v;
    // With no contribution at all, show the equality line rather than dividing by zero.
    points.push({ x: (i + 1) / n, y: total > 0 ? running / total : (i + 1) / n });
  });
  return points;
}

/** Share held by the lowest-contributing half of members (floor(n/2) of them); null for fewer than 2. */
export function lowestHalf(shares: number[]): { count: number; of: number; share: number; equalShare: number } | null {
  const n = shares.length;
  if (n < 2) return null;
  const k = Math.floor(n / 2);
  const pts = lorenzPoints(shares);
  return { count: k, of: n, share: pts[k].y, equalShare: k / n };
}

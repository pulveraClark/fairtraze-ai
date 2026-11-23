// Order of cards inside a column. Positions are doubles: a card dropped between two neighbours
// takes the midpoint; when two neighbours get closer than MIN_GAP the whole column is renumbered.

export const POSITION_STEP = 1024;
export const MIN_GAP = 1e-6;

export interface Positioned { id: number; position: number }

/**
 * `column` = the target column's other cards, sorted by (position, id), excluding the moved card.
 * `afterId`: drop right after that card. `beforeId`: drop right before it. Neither: end of column.
 * Returns null when a referenced neighbour is not in the column.
 */
export function computePosition(
  column: Positioned[],
  opts: { afterId?: number | null; beforeId?: number | null },
): { position: number; needsRebalance: boolean } | null {
  let lower: number | null;
  let upper: number | null;

  if (opts.afterId != null) {
    const i = column.findIndex((c) => c.id === opts.afterId);
    if (i < 0) return null;
    lower = column[i]!.position;
    upper = column[i + 1]?.position ?? null;
  } else if (opts.beforeId != null) {
    const i = column.findIndex((c) => c.id === opts.beforeId);
    if (i < 0) return null;
    upper = column[i]!.position;
    lower = i > 0 ? column[i - 1]!.position : null;
  } else {
    lower = column.length ? column[column.length - 1]!.position : null;
    upper = null;
  }

  if (lower === null && upper === null) return { position: POSITION_STEP, needsRebalance: false };
  if (upper === null) return { position: lower! + POSITION_STEP, needsRebalance: false };
  if (lower === null) return { position: upper - POSITION_STEP, needsRebalance: false };
  const gap = upper - lower;
  return { position: lower + gap / 2, needsRebalance: gap < MIN_GAP * 2 };
}

/** New evenly spaced positions for a column, in its current order. */
export function rebalanced(column: Positioned[]): Positioned[] {
  return column.map((c, i) => ({ id: c.id, position: (i + 1) * POSITION_STEP }));
}

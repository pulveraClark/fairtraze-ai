// Wording for images in the instructor's member window. Display only: it reads numbers the report
// already stores and never changes a score. No thresholds are shown.

/**
 * "2 counted of 3 added" for a report that records counted images; the older wording for a report
 * saved before image credit; null when there is nothing to say. `added` is the gross number of
 * images the member inserted, so it is never shown below the counted number.
 */
export function instructorImageLine(added: number, counted: number | undefined | null): string | null {
  if (counted === undefined || counted === null) {
    return added > 0 ? `${added} image${added === 1 ? "" : "s"} inserted` : null;
  }
  const total = Math.max(added, counted);
  if (total === 0) return null;
  return `${counted} counted of ${total} added`;
}

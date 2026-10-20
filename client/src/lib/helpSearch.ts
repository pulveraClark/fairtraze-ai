/** Plain-text matching for the Help search box (no AI). Case-insensitive; "free rider" finds "free-rider". */

/** Lowercase, punctuation and hyphens become spaces, runs of spaces collapse. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The words typed in the search box, normalized. */
export function queryWords(query: string): string[] {
  const n = normalize(query);
  return n ? n.split(" ") : [];
}

/** True when every typed word appears somewhere in the text. An empty query matches everything. */
export function matches(text: string, query: string): boolean {
  const words = queryWords(query);
  if (words.length === 0) return true;
  const haystack = normalize(text);
  return words.every((w) => haystack.includes(w));
}

/** [start, end) offsets of every typed word inside one piece of text (for highlighting). */
export function findRanges(text: string, words: string[]): [number, number][] {
  const lower = text.toLowerCase();
  const out: [number, number][] = [];
  for (const w of words) {
    for (let i = lower.indexOf(w); i !== -1; i = lower.indexOf(w, i + w.length)) out.push([i, i + w.length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

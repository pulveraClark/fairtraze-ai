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

/**
 * Staff-side words and their student-view wording, so a search finds the page's plain-language text
 * (e.g. students never see "free-rider" or "Gini"). Keys and targets are normalized phrases.
 */
export const SYNONYMS: ReadonlyArray<readonly [string, string]> = [
  ["free rider", "low contribution"],
  ["inactive", "low contribution"],
  ["gini", "how evenly work is shared"],
  ["inequality", "how evenly work is shared"],
  ["dispute", "note"],
];

/** The synonyms whose key appears as whole words in the query, as [key, target]. */
function synonymsIn(query: string): [string, string][] {
  const padded = ` ${normalize(query)} `;
  return SYNONYMS.filter(([key]) => padded.includes(` ${key} `)).map(([k, t]) => [k, t]);
}

/** The query as typed plus one rewritten copy per synonym it contains. */
function variants(query: string): string[] {
  const n = normalize(query);
  const out = [n];
  for (const [key, target] of synonymsIn(query)) out.push(normalize(` ${n} `.replace(` ${key} `, ` ${target} `)));
  return out;
}

/** True when the text has every typed word, or every word of a synonym-rewritten query. An empty query matches everything. */
export function matches(text: string, query: string): boolean {
  if (queryWords(query).length === 0) return true;
  const haystack = normalize(text);
  return variants(query).some((v) => v.split(" ").every((w) => haystack.includes(w)));
}

/** What to highlight: the typed words plus the student wording of any synonym used. */
export function highlightTerms(query: string): string[] {
  return [...new Set([...queryWords(query), ...synonymsIn(query).map(([, t]) => t)])];
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

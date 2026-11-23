// Tolerant matching of a quoted sentence against the project instructions. Strict about the WORDS, relaxed
// about formatting: case, spacing, curly vs straight quotes, dash types, list markers and light markdown.
// No fuzzy matching and no edit distance: one changed word is a different quote.
// Pure text helpers shared by the server (confirms a requirement's source) and the client (highlights the
// sentence in the original text). Not scoring code.

const SINGLE_QUOTES = /[‘’‚‛′´]/;
const DOUBLE_QUOTES = /[“”„‟″«»]/;
const DASHES = /[‐‑‒–—―−]/;
// A list or heading marker at the start of a line: "- ", "* ", "+ ", "• ", "> ", "# ".."###### ", "1. ", "1) ".
// Markers can repeat ("> - item"). They only count when followed by a space.
const LINE_MARKERS = /^\s*(?:(?:[-*+•>]|#{1,6}|\d+[.)])[ \t]+)+/;
const TRAILING_PUNCTUATION = /[\s.,;:!?…)"'-]+$/;

export interface NormalizedText {
  text: string;
  // map[i] = index in the original text of the character that produced text[i].
  map: number[];
}

/** Normalizes `input` and remembers where each kept character came from in the original. */
export function normalizeWithMap(input: string): NormalizedText {
  const out: string[] = [];
  const map: number[] = [];
  let pendingSpace = -1; // original index of the first whitespace of a pending run, or -1
  let offset = 0;
  for (const line of input.split(/\r\n|\r|\n/)) {
    // Line breaks are whitespace; the split lost their length, so find where this line really starts.
    const start = input.indexOf(line, offset);
    const lineStart = start === -1 ? offset : start;
    offset = lineStart + line.length;
    if (out.length > 0 && pendingSpace === -1) pendingSpace = Math.max(lineStart - 1, 0);

    const body = line.replace(LINE_MARKERS, (m) => " ".repeat(m.length));
    for (let i = 0; i < body.length; i++) {
      const ch = body[i]!;
      const origin = lineStart + i;
      if (/\s/.test(ch)) {
        if (out.length > 0 && pendingSpace === -1) pendingSpace = origin;
        continue;
      }
      if (ch === "*" || ch === "`") continue;
      if (pendingSpace !== -1) {
        out.push(" ");
        map.push(pendingSpace);
        pendingSpace = -1;
      }
      const folded = SINGLE_QUOTES.test(ch) ? "'" : DOUBLE_QUOTES.test(ch) ? '"' : DASHES.test(ch) ? "-" : ch;
      for (const c of folded.toLowerCase()) {
        out.push(c);
        map.push(origin);
      }
    }
  }
  return { text: out.join(""), map };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Index of `quote` in `text` (both already normalized), or -1. The match must start and end on a word
 * boundary, so "login habit" does not match inside "login habits". `partialEnd` allows the last word to be
 * cut short (a quote that was shortened to a character limit).
 */
export function indexOfQuote(text: string, quote: string, partialEnd = false): number {
  if (!quote) return -1;
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const before = at === 0 ? "" : text[at - 1]!;
    const after = text[at + quote.length] ?? "";
    if (before && WORD_CHAR.test(before) && WORD_CHAR.test(quote[0]!)) continue;
    if (!partialEnd && after && WORD_CHAR.test(after) && WORD_CHAR.test(quote[quote.length - 1]!)) continue;
    return at;
  }
  return -1;
}

/** The instructions text, normalized for matching. */
export function normalizeInstructions(text: string): string {
  return normalizeWithMap(text).text;
}

/** A quote, normalized for matching; trailing punctuation is dropped too. */
export function normalizeQuote(quote: string): string {
  return normalizeWithMap(quote).text.replace(TRAILING_PUNCTUATION, "");
}

/** Where `quote` is in the ORIGINAL `text` ([start, end) offsets), or null when it is not there. */
export function findQuoteRange(text: string, quote: string): { start: number; end: number } | null {
  const q = normalizeQuote(quote);
  if (!q) return null;
  const { text: norm, map } = normalizeWithMap(text);
  const at = indexOfQuote(norm, q);
  if (at === -1) return null;
  return { start: map[at]!, end: map[at + q.length - 1]! + 1 };
}

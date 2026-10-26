// A light readability counter for what Gemini wrote: how many sentences are longer than 25 words. It only
// counts and logs. It never rejects a text, retries a call or changes anything a user sees.

export const LONG_SENTENCE_WORDS = 25;

/** Sentences of a text: split after . ! ? followed by a space or a line break (so "route.ts" is not split). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

const wordCount = (sentence: string) => sentence.split(/\s+/).filter(Boolean).length;

export interface ReadabilityCount {
  sentences: number;
  long: number;
}

/** How many sentences there are across the texts, and how many have more than `maxWords` words. */
export function countLongSentences(texts: string[], maxWords = LONG_SENTENCE_WORDS): ReadabilityCount {
  let sentences = 0;
  let long = 0;
  for (const text of texts) {
    for (const s of splitSentences(text)) {
      sentences++;
      if (wordCount(s) > maxWords) long++;
    }
  }
  return { sentences, long };
}

/** One log line; nothing when there was no text. */
export function logReadability(label: string, texts: string[]): ReadabilityCount {
  const count = countLongSentences(texts);
  if (count.sentences > 0) {
    console.info(`[ai-review] readability ${label}: ${count.long} of ${count.sentences} sentences have more than ${LONG_SENTENCE_WORDS} words`);
  }
  return count;
}

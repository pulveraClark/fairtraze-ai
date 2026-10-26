// Plain-English rules for everything Gemini writes for people to read: the AI findings on each member, the
// score explanation on the report, and the AI's own sentences in the project instructions check.
// This is advice to the model only. It does not replace the tone guard (no grades, percentages, shares,
// scores, flags or comparisons), which is unchanged, and nothing here checks the output (the log-only
// counter in aiReview/readability.ts only counts long sentences). Fixed screen text is not part of this.

export const PLAIN_ENGLISH_RULES = `PLAIN ENGLISH
- Write short sentences, about 15 words or fewer, with one idea each. Never go past 25 words. Use everyday words and the active voice. No idioms and no slang. English only.
- Say what was done first, then the detail. Example: "Fixed a bug in the route file."
- Explain a technical term once, in a few plain words, or avoid it. If a member's work is only in the group document, do not use the words commit, repository or code.
- If a simpler word would change the meaning, keep the exact word. Accuracy comes first.
- Copy quotes, file names and section headings word for word. Never simplify them.`;

// Only the score explanation names members and mentions the Gini coefficient.
export const NARRATIVE_PLAIN_ENGLISH_EXTRA = `- When you write about a member, say what the person did first, then the detail. Example: "Kient fixed a bug in the route file."
- Explain the Gini coefficient once, in one short sentence, for example: it shows how evenly the work is shared.`;

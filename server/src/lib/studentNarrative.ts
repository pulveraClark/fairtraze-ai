export const NO_TEAM_COMMENT = "The AI has no extra comment on the team this time.";

// A sentence that states a team-level measure: the Gini value or what it is called, a decimal such as 0.31, a
// "band" or "index" next to a number, or "team index". The student side never shows any of these.
const MEASURE_WORDS = /gini|inequality|coefficient|concentration/i;
const DECIMAL = /\d\.\d/;
const BAND_OR_INDEX_WITH_NUMBER = /\b(?:band|index)\b[^.\n]{0,24}\d|\d[^.\n]{0,24}\b(?:band|index)\b/i;
const TEAM_INDEX = /\bteam\s+index\b/i;

export function isTeamMeasureSentence(sentence: string): boolean {
  return MEASURE_WORDS.test(sentence) || DECIMAL.test(sentence) || BAND_OR_INDEX_WITH_NUMBER.test(sentence) || TEAM_INDEX.test(sentence);
}

/**
 * The instructor's AI explanation as the group LEADER may read it: the same text minus every sentence that states a
 * team-level measure (see above). Null when there is no text at all; the fixed "no extra comment" line when text
 * existed but no clean sentence is left. Display only: the stored text and every score are untouched.
 */
export function studentNarrative(text: string | null | undefined): string | null {
  if (!text || !text.trim()) return null;
  const kept = text
    .split(/\n{2,}/)
    .map((para) => para.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "" && !isTeamMeasureSentence(s)).join(" ").trim())
    .filter((para) => para.length > 0);
  return kept.length > 0 ? kept.join("\n\n") : NO_TEAM_COMMENT;
}

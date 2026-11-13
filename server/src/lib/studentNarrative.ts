export const NO_TEAM_COMMENT = "The AI has no extra comment on the team this time.";

// A sentence that states a team-level measure: the Gini value or what it is called, a decimal such as 0.31, a
// "band" or "index" next to a number, or "team index". The student side never shows any of these.
const MEASURE_WORDS = /gini|inequality|coefficient|concentration/i;
const DECIMAL = /\d\.\d/;
const BAND_OR_INDEX_WITH_NUMBER = /\b(?:band|index)\b[^.\n]{0,24}\d|\d[^.\n]{0,24}\b(?:band|index)\b/i;
const TEAM_INDEX = /\bteam\s+index\b/i;
// The team-health label and what it is called: "team health", "health label", "Moderate Risk" / "High Risk",
// "classified/rated ... as Healthy", and the capitalised label "Healthy" in a sentence about the team or group.
// Plain lower-case "healthy" ("a healthy mix of tasks") is deliberately NOT matched.
const HEALTH_WORDS = /\bteam[\s-]+health\b|\bhealth[\s-]+label\b|\b(?:moderate|high)[\s-]+risk\b|\b(?:classified|rated|labell?ed|categori[sz]ed|assessed|graded)\s+(?:as\s+)?["“']?healthy\b/i;
const HEALTH_LABEL_WITH_TEAM = /\b(?:team|group)\b[^.!?]*\bHealthy\b|\bHealthy\b[^.!?]*\b(?:team|group)\b/;

export function isTeamMeasureSentence(sentence: string): boolean {
  return (
    MEASURE_WORDS.test(sentence) || DECIMAL.test(sentence) || BAND_OR_INDEX_WITH_NUMBER.test(sentence) || TEAM_INDEX.test(sentence) ||
    HEALTH_WORDS.test(sentence) || HEALTH_LABEL_WITH_TEAM.test(sentence)
  );
}

/**
 * Any AI text a student or leader may read (member summaries): the same sentences removed as in
 * studentNarrative, at read time, so older stored text is safe too. Returns the original text when
 * nothing needs removing; an empty string when every sentence was a team measure.
 */
export function stripTeamMeasures(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (!sentences.some(isTeamMeasureSentence)) return text;
  return sentences.filter((s) => s.trim() !== "" && !isTeamMeasureSentence(s)).join(" ").trim();
}

/**
 * The instructor's AI explanation as the group LEADER may read it: the same text minus every sentence that states a
 * team-level measure (see above). Null when there is no text at all; the fixed "no extra comment" line when text
 * existed but no clean sentence is left. Display only: the stored text and every score are untouched.
 */
// Sentences that only restate how evenly the work is shared. The leader's card already shows that in plain words
// ("No one is far above or below the others."), so the AI's version is dropped. Used ONLY for the team explanation,
// never for member summaries (a summary may say "spread her commits evenly").
const EVEN_WORDS = "(?:evenly|equally|fairly|unevenly|unequally)";
const SHARE_VERBS = "(?:spread|shared|distributed|divided|split)";
const EVENNESS_PATTERNS: RegExp[] = [
  /\bthis\s+(?:value|figure|number|score|measure|result)\b/i,
  new RegExp(`\\b${SHARE_VERBS}\\s+(?:(?:very|quite|fairly|pretty|rather|somewhat)\\s+)?${EVEN_WORDS}\\b`, "i"),
  new RegExp(`\\b${EVEN_WORDS}\\s+${SHARE_VERBS}\\b`, "i"),
  /\bevenness\b/i,
  /\b(?:balanced|equal|even|uneven|unequal)\s+(?:contribution|contributions|workload|participation|effort|distribution|share|shares)\b/i,
  /\b(?:contribution|contributions|workload|participation|effort|distribution)\s+(?:was|were|is|are|looks?|seems?|appears?)\s+(?:\w+\s+)?(?:balanced|even|evenly|equal|uneven|unevenly|unequal|unbalanced)\b/i,
];

export function isEvennessSentence(sentence: string): boolean {
  return EVENNESS_PATTERNS.some((re) => re.test(sentence));
}

/** Null when no clean sentence is left, so the card hides the AI block instead of showing an empty one. */
export function studentNarrative(text: string | null | undefined): string | null {
  if (!text || !text.trim()) return null;
  const drop = (s: string) => isTeamMeasureSentence(s) || isEvennessSentence(s);
  const kept = text
    .split(/\n{2,}/)
    .map((para) => para.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== "" && !drop(s)).join(" ").trim())
    .filter((para) => para.length > 0);
  return kept.length > 0 ? kept.join("\n\n") : null;
}

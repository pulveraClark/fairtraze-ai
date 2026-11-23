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

// ── Names, percentages and flag words (student and leader text) ───────────────────────────────
// A sentence that names a person and quotes their share ("Ana, with a contribution share of 12.5%, ...") used to be
// dropped whole because of the decimal, leaving the next "They made 2 commits..." with no one to refer to. Now the
// share clause is cut out and the sentence stays; a sentence that still holds a percentage is dropped; a sentence
// that starts with a pronoun is kept only when the sentence before it in the same paragraph was kept.
const PCT = String.raw`\d+(?:\.\d+)?\s*%`;
const SHARE_CLAUSES: RegExp[] = [
  // ", with a contribution share of 12.5%," / "has an overall share of about 12.5%"
  new RegExp(String.raw`,?\s*(?:with|has|had|holding|at)?\s*(?:an?|the)?\s*(?:overall\s+|total\s+|combined\s+)?(?:contribution\s+)?share\s+of\s+(?:about\s+|around\s+|roughly\s+)?${PCT},?`, "gi"),
  // "(12.5%)" / "(about 12.5%)"
  new RegExp(String.raw`\s*\(\s*(?:about\s+|around\s+|roughly\s+)?${PCT}\s*\)`, "gi"),
];
const PRONOUN_START = /^(?:they|he|she|their|his|her|it|its|this member|these members)\b/i;

export function stripShareClauses(sentence: string): string {
  let out = sentence;
  for (const re of SHARE_CLAUSES) out = out.replace(re, " ");
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
}

/** "free-rider" and "inactive" read as "low contribution" for students and leaders; "overload" is unchanged. */
export function studentFlagWords(text: string): string {
  const HAS: Record<string, string> = { is: "has", was: "had", are: "have", were: "had" };
  return text
    .replace(/\b(is|was|are|were)\s+an?\s+(?:free[\s-]?rider|inactive\s+member)\b/gi, (_m, v: string) => `${HAS[v.toLowerCase()]} low contribution`)
    .replace(/\bas\s+an?\s+(?:free[\s-]?rider|inactive\s+member)\b/gi, "for low contribution")
    .replace(/\ban?\s+(?:free[\s-]?rider|inactive\s+member)\b/gi, "low contribution")
    .replace(/\bfree[\s-]?riders?\b/gi, "low contribution")
    .replace(/\binactive\b/gi, "low contribution");
}

const FLAG_PHRASE: Record<string, string> = {
  "free-rider": "low contribution",
  inactive: "low contribution",
  overload: "overload",
  "deadline-driven": "deadline-driven work",
};

/**
 * AI text about ONE member (work summaries) for students and leaders: share clauses cut, any sentence that still
 * holds a percentage or states a team measure dropped, flag words in plain form. Unlike the team explanation there
 * is no pronoun rule (a summary is about one person) and no evenness rule ("spread her commits evenly" is fine).
 * Returns "" when nothing is left; callers then leave the summary out.
 */
export function studentSafeText(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.split(/(?<=[.!?])\s+/)
      .map((s) => stripShareClauses(s.trim()))
      .filter((s) => s !== "" && !new RegExp(PCT).test(s) && !isTeamMeasureSentence(s))
      .map(studentFlagWords)
      .join(" ").trim())
    .filter((para) => para.length > 0)
    .join("\n\n");
}

/** Null when no clean sentence is left, so the card hides the AI block instead of showing an empty one. */
export function studentNarrative(text: string | null | undefined, people: Array<{ name: string; flags: string[] }> = []): string | null {
  if (!text || !text.trim()) return null;
  const paragraphs = text.split(/\n{2,}/).map((para) => {
    const out: string[] = [];
    let prevKept = false;
    for (const raw of para.split(/(?<=[.!?])\s+/)) {
      const s = raw.trim();
      if (s === "") continue;
      let keep: boolean = !isEvennessSentence(s) && !(PRONOUN_START.test(s) && !prevKept);
      let clean = s;
      if (keep) {
        clean = stripShareClauses(s);
        if (new RegExp(PCT).test(clean) || isTeamMeasureSentence(clean)) keep = false;
      }
      prevKept = keep;
      if (keep) out.push(studentFlagWords(clean));
    }
    return out.join(" ").trim();
  }).filter((para) => para.length > 0);
  if (paragraphs.length === 0) return null;
  // Every flagged person is named: if the text lost the sentence that named them, say it again in plain words.
  const body = paragraphs.join("\n\n");
  const lowerBody = body.toLowerCase();
  const named = (name: string) => {
    const first = name.trim().split(/\s+/)[0] ?? "";
    const re = first ? new RegExp(`(?<![\\p{L}\\p{N}])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu") : null;
    return lowerBody.includes(name.trim().toLowerCase()) || (re !== null && re.test(body));
  };
  const lost = people.filter((p) => p.flags.length > 0 && !named(p.name));
  if (lost.length === 0) return body;
  const extra = lost.map((p) => {
    const phrases = [...new Set(p.flags.map((f) => FLAG_PHRASE[f] ?? f))];
    return `${p.name} was flagged for ${phrases.join(" and ")}.`;
  });
  return `${body}\n\n${extra.join(" ")}`;
}

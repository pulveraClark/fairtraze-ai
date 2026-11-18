// Wording for the "Low contribution" flag name, shared by client and server so the two cannot drift.
// Display wording only: the flag keys ("free-rider", "inactive"), thresholds, scoring and stored data are not touched,
// and nothing in the scoring files imports this.

export const LOW_CONTRIBUTION_LABEL = "Low contribution";

/** Lower-case form for running text and for the "Flags:" line sent to the AI. */
export const LOW_CONTRIBUTION_PHRASE = "low contribution";

/** The two flag keys that read "Low contribution". */
export function isLowContributionFlag(flag: string): boolean {
  return flag === "free-rider" || flag === "inactive";
}

/** Name of a flag as the AI is told about it ("Flags: low contribution, overload"). Other keys are unchanged. */
export function flagNameForPrompt(flag: string): string {
  return isLowContributionFlag(flag) ? LOW_CONTRIBUTION_PHRASE : flag;
}

const keepCase = (original: string, replacement: string): string =>
  original[0] !== undefined && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()
    ? replacement[0].toUpperCase() + replacement.slice(1)
    : replacement;

const RIDER = String.raw`free[\s-]?rider`;

/**
 * Rewrites the old flag names in AI-written narrative text for the INSTRUCTOR to read. Display only: never applied
 * to stored text, never to the narrative hash input, never for students or leaders (they use studentFlagWords on the
 * server). Only the flag wording changes; numbers, names and every other word are left alone.
 *
 *   "A free-rider flag means ..."   -> "A low-contribution flag means ..."
 *   "a free-rider" / "an inactive member" -> "a low-contribution member"
 *   "free-riders" / "inactive members"    -> "low-contribution members"
 *   "free-riding"                   -> "low contribution"
 *   "free-rider" (the flag's name)  -> "low contribution"
 * A bare "inactive" that is not "inactive member(s)" or "inactive flag" is ordinary English and is left unchanged.
 */
export function flagWordsForInstructor(text: string): string {
  return text
    // article + old name + noun that already follows: keep the noun ("a free-rider flag" -> "a low-contribution flag")
    .replace(new RegExp(String.raw`\b(an?)\s+(?:${RIDER}|inactive)\s+(flags?|members?|label|status)\b`, "gi"),
      (_m, a: string, noun: string) => `${keepCase(a, "a")} low-contribution ${noun}`)
    // adjective use before "flag(s)"
    .replace(new RegExp(String.raw`\b(${RIDER}|inactive)(?=\s+flags?\b)`, "gi"),
      (m) => keepCase(m, "low-contribution"))
    // a bare noun after an article ("is a free-rider")
    .replace(new RegExp(String.raw`\b(an?)\s+${RIDER}\b`, "gi"),
      (_m, a: string) => `${keepCase(a, "a")} low-contribution member`)
    // plurals
    .replace(new RegExp(String.raw`\b(${RIDER}s|inactive members)\b`, "gi"),
      (m) => keepCase(m, "low-contribution members"))
    // singular "inactive member" without an article
    .replace(/\binactive member\b/gi, (m) => keepCase(m, "low-contribution member"))
    .replace(/\bfree[\s-]?riding\b/gi, (m) => keepCase(m, LOW_CONTRIBUTION_PHRASE))
    .replace(new RegExp(String.raw`\b${RIDER}\b`, "gi"), (m) => keepCase(m, LOW_CONTRIBUTION_PHRASE));
}

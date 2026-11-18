// Display wording for student-facing screens. Display mapping only. The team-health label and the Gini
// value are never sent to a student: the server sends one plain evenness word (even / a-bit-uneven /
// very-uneven) and this file turns it into a sentence. Instructors keep the original terms.
import { isLowContributionFlag, LOW_CONTRIBUTION_LABEL } from "./flagLabel";

/** "free-rider" and "inactive" read as "Low contribution" (the word every role sees); other flags keep their names here. */
export function studentFlagLabel(flag: string): string {
  return isLowContributionFlag(flag) ? LOW_CONTRIBUTION_LABEL : flag;
}

/** Student-facing labels for a list of flags, without repeats (both of the two above map to one label). */
export function studentFlagLabels(flags: readonly string[]): string[] {
  return [...new Set(flags.map(studentFlagLabel))];
}

const HEALTH_WORDS: Record<string, string> = {
  even: "Work is evenly shared",
  "a-bit-uneven": "Work is a bit uneven",
  "very-uneven": "Work is very uneven",
};

const EVENNESS_LINE: Record<string, string> = {
  even: "No one is far above or below the others.",
  "a-bit-uneven": "Some members are a bit above or below the others.",
  "very-uneven": "Some members are far above or below the others.",
};

/** The one plain line under the evenness chip, finishing the sentence the chip starts ("Work is evenly shared"). */
export function evennessLine(evenness: string): string {
  return EVENNESS_LINE[evenness] ?? "";
}

/** Plain words for the evenness word on student screens ("a-bit-uneven" becomes "Work is a bit uneven"). */
export function studentHealthLabel(evenness: string): string {
  return HEALTH_WORDS[evenness] ?? evenness;
}

/** The one calm line above a student's flags on early data. Never accusatory; null when no tag applies. */
export function earlyDataFlagsNote(level: "low" | "medium" | "high" | "final" | null | undefined): string | null {
  if (level === "low") return "This is early data, so these notes may change as more work is recorded.";
  if (level === "medium") return "These notes may change as more work is recorded.";
  return null;
}

/** The one note under the AI parts of the leader's Team overview card. Replaces the five earlier disclaimers. */
export const AI_CARD_NOTE = "AI findings can be wrong and are not a grade.";

/**
 * Instructor-only tooltip for a flag whose student wording differs ("free-rider" and "inactive" read as
 * "Low contribution" to students). The wording comes from `studentFlagLabel`, never retyped. Null when students see the same word.
 */
export function flagStudentWordingTip(flag: string): string | null {
  const label = studentFlagLabel(flag);
  if (label === flag) return null;
  return `Students see this flag as '${label}'. Same rule, softer wording for students.`;
}

/** Help page sentence for instructors, built from the same mapping. */
export const instructorFlagWordingHelp = (): string =>
  `Students see the free-rider flag as '${studentFlagLabel("free-rider")}'. The rule and the numbers are the same.`;

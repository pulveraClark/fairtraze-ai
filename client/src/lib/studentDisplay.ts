// Display wording for student-facing screens. Display mapping only: the computed flags, team health
// labels and Gini are stored and sent unchanged; instructors keep the original terms.

/** "free-rider" and "inactive" read as "Low contribution" to students; other flags keep their names. */
export function studentFlagLabel(flag: string): string {
  return flag === "free-rider" || flag === "inactive" ? "Low contribution" : flag;
}

/** Student-facing labels for a list of flags, without repeats (both of the two above map to one label). */
export function studentFlagLabels(flags: readonly string[]): string[] {
  return [...new Set(flags.map(studentFlagLabel))];
}

const HEALTH_WORDS: Record<string, string> = {
  Healthy: "Work is evenly shared",
  "Moderate Risk": "Work is a bit uneven",
  "High Risk": "Work is very uneven",
};

const EVENNESS_LINE: Record<string, string> = {
  Healthy: "No one is far above or below the others.",
  "Moderate Risk": "Some members are a bit above or below the others.",
  "High Risk": "Some members are far above or below the others.",
};

/** The one plain line under the evenness chip, finishing the sentence the chip starts ("Work is evenly shared"). */
export function evennessLine(teamHealth: string): string {
  return EVENNESS_LINE[teamHealth] ?? "";
}

/** Plain words for the team health label on student screens ("Moderate Risk" becomes "Work is a bit uneven"). */
export function studentHealthLabel(teamHealth: string): string {
  return HEALTH_WORDS[teamHealth] ?? teamHealth;
}

/** The one calm line above a student's flags on early data. Never accusatory; null when no tag applies. */
export function earlyDataFlagsNote(level: "low" | "medium" | "high" | "final" | null | undefined): string | null {
  if (level === "low") return "This is early data, so these notes may change as more work is recorded.";
  if (level === "medium") return "These notes may change as more work is recorded.";
  return null;
}

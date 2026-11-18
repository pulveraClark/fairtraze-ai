// The one place that decides how a flag is NAMED for a reader. Every role (student, leader, instructor, print,
// help, overview) sees "Low contribution" for both the "free-rider" and the "inactive" flag. The keys stay
// "free-rider" / "inactive" in code, scoring and stored data; this is display wording only.
// The server twin is server/src/lib/flagWording.ts (a test keeps the two constants equal).

export const LOW_CONTRIBUTION_LABEL = "Low contribution";

/** True for the two flags that read "Low contribution". */
export function isLowContributionFlag(flag: string): boolean {
  return flag === "free-rider" || flag === "inactive";
}

const OTHER_LABEL: Record<string, string> = {
  overload: "Overload",
  "deadline-driven": "Deadline-driven",
};

/** Reader-facing flag name (sentence case). Unknown keys are returned unchanged. */
export function flagLabel(flag: string): string {
  if (isLowContributionFlag(flag)) return LOW_CONTRIBUTION_LABEL;
  return OTHER_LABEL[flag] ?? flag;
}

/** Labels for a list of flags, without repeats (free-rider and inactive both map to one label). */
export function flagLabels(flags: readonly string[]): string[] {
  return [...new Set(flags.map(flagLabel))];
}

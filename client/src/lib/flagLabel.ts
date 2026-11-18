// The one place that decides how a flag is NAMED for a reader. Every role (student, leader, instructor, print,
// help, overview) sees "Low contribution" for both the "free-rider" and the "inactive" flag. The keys stay
// "free-rider" / "inactive" in code, scoring and stored data; this is display wording only.
// The constant and the key test live in shared/src/flagWording.ts, so the server (AI prompt) reads the very same ones.
import { isLowContributionFlag, LOW_CONTRIBUTION_LABEL } from "@shared/flagWording";
export { isLowContributionFlag, LOW_CONTRIBUTION_LABEL };

const OTHER_LABEL: Record<string, string> = {
  overload: "Overload",
  "deadline-driven": "Deadline-driven",
};

/** Reader-facing flag name (sentence case). Unknown keys are returned unchanged. */
export function flagLabel(flag: string): string {
  if (isLowContributionFlag(flag)) return LOW_CONTRIBUTION_LABEL;
  return OTHER_LABEL[flag] ?? flag;
}

/** One flag per displayed label (free-rider and inactive share one); "inactive" wins as the more specific reason. */
export function dedupeFlagsByLabel<T extends string>(flags: readonly T[]): T[] {
  const sorted = [...flags].sort((a, b) => Number(b === "inactive") - Number(a === "inactive"));
  const seen = new Set<string>();
  const kept = sorted.filter((f) => (seen.has(flagLabel(f)) ? false : (seen.add(flagLabel(f)), true)));
  return flags.filter((f) => kept.includes(f));
}

const trim1 = (n: number) => String(Math.round(n * 10) / 10);

/**
 * The short reason under a "Low contribution" pill (instructors and leaders), so the two causes stay distinguishable.
 * Restates the stored threshold; never computes a flag. Null for other flags or when the threshold is not known.
 */
export function flagReason(
  flag: string,
  memberCount: number,
  thresholds: { freeRider: number } | null | undefined,
): string | null {
  if (flag === "inactive") return "No recorded activity";
  if (flag !== "free-rider" || !thresholds || memberCount <= 0) return null;
  const of = thresholds.freeRider === 0.5 ? "half" : `${trim1(thresholds.freeRider * 100)}%`;
  const pct = trim1((thresholds.freeRider * 100) / memberCount);
  return `Below ${of} of an equal share (${pct}% for ${memberCount} member${memberCount === 1 ? "" : "s"})`;
}

/** Labels for a list of flags, without repeats (free-rider and inactive both map to one label). */
export function flagLabels(flags: readonly string[]): string[] {
  return [...new Set(flags.map(flagLabel))];
}

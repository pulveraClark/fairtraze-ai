import type { Flag, ScoringThresholds } from "@shared/types";
import { describeFlagRule, type DeadlineBasis, type FlagSource } from "./flagRules";
import { giniBands } from "./giniBands";

// The legend printed under the instructor's detailed export. Nothing is retyped: flag rules come from
// describeFlagRule (the same restatement the report screens use), the Gini bands from giniBands (the
// shared scoring constants). Only the one-line column meanings live here. Display only.

export const EXPORT_FLAGS: readonly Flag[] = ["inactive", "free-rider", "overload", "deadline-driven"];

export function flagLegend(
  thresholds: ScoringThresholds | null | undefined,
  source: FlagSource,
  basis?: DeadlineBasis | null,
): { flag: Flag; rule: string }[] {
  return EXPORT_FLAGS.map((flag) => ({
    flag,
    // When the stored thresholds are missing the rule cannot be stated exactly: the flag name stands alone.
    rule: describeFlagRule(flag, thresholds, source, basis) ?? "Set by the scoring rules for this project.",
  }));
}

export function bandLegend(): string {
  return giniBands().map((b) => `${b.label}: ${b.range}`).join(" · ");
}

/** One-line meaning of each column printed in the member table. */
export function columnLegend(sourceType: string | null): { term: string; meaning: string }[] {
  const docs = sourceType === "EDITOR";
  if (sourceType === "COMBINED") {
    return [
      { term: "GitHub share", meaning: "The member's share of the group's GitHub work." },
      { term: "Docs share", meaning: "The member's share of the group's document work." },
      { term: "Combined share", meaning: "The two shares blended with the weights shown under the table. Shares add up to 100%." },
    ];
  }
  return [
    { term: "Share", meaning: "The member's share of the group's recorded work. Shares add up to 100%." },
    docs
      ? { term: "Sessions", meaning: "Editing sessions: bursts of editing, closed after 30 minutes idle." }
      : { term: "Commits", meaning: "Authored commits (merge commits are not counted)." },
    { term: "Active days", meaning: docs ? "Days with at least 30 retained characters written." : "Distinct days with a commit." },
    docs
      ? { term: "Retained chars", meaning: "Text the member wrote that is still in the final document." }
      : { term: "Weighted lines", meaning: "Added lines weighted by line type, file type and commit impact." },
  ];
}

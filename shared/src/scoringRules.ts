// Version of the deterministic scoring rules a report was computed with. Bump it whenever a change
// to scoring would make an existing report's numbers differ from a fresh analysis, so every older
// report is shown as outdated (read-time comparison; nothing is recomputed or rewritten).
//   1 = original rules (every added line equal; Docs 0.4/0.2/0.4; UTC session-start days)
//   2 = line type x file type x commit impact; Docs 0.6/0.2/0.2; Docs active day needs
//       MIN_ACTIVE_DAY_RETAINED_CHARS retained characters; active days are Asia/Manila days
export const SCORING_RULES_VERSION = 2;

/** True when a stored report was scored with older rules. A missing version means version 1. */
export function isRulesOutdated(stored: { scoringRulesVersion?: number } | null | undefined): boolean {
  if (!stored) return false;
  return (stored.scoringRulesVersion ?? 1) < SCORING_RULES_VERSION;
}

export const RULES_OUTDATED_INSTRUCTOR_NOTICE = "Scoring was updated. Re-analyze to apply the new rules.";
export const RULES_OUTDATED_STUDENT_NOTICE =
  "This report uses older scoring rules. It updates when your instructor re-analyzes.";

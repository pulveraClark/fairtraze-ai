// The one footer sentence under AI text (instructor Narrative card and the leader's team explanation).
// Display only. It folds the "what we can't see" note into the existing "May be wrong / informational only"
// line instead of adding a second line.
export const AI_FOOTER_DISCLAIMER = "Informational only; it does not assign grades or replace instructor judgment.";
export const AI_FOOTER_OUTSIDE_WORK = "Work outside GitHub and FairTraze Docs, such as meetings, research, design and offline work, is not counted.";

/** "May be wrong · Based on the analysis of {when}. Informational only; ... is not counted." (`when` optional). */
export function aiFooterLine(when?: string | null): string {
  return `May be wrong${when ? ` · Based on the analysis of ${when}` : ""}. ${AI_FOOTER_DISCLAIMER} ${AI_FOOTER_OUTSIDE_WORK}`;
}

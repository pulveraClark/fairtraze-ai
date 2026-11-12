// Wording and formatting for the Contribution Evidence Report. Plain functions so the page and its
// tests share one definition. Display only: no number here is computed from raw activity.
import type { EvidenceReportDto } from "@shared/evidenceReport";

export const GITHUB_LABEL = "GitHub";
export const EDITOR_LABEL = "FAIRTRAZE Collaborative Editor";

export function sourcesText(sourceType: EvidenceReportDto["sourceType"]): string {
  if (sourceType === "GITHUB") return GITHUB_LABEL;
  if (sourceType === "EDITOR") return EDITOR_LABEL;
  return `${GITHUB_LABEL} + ${EDITOR_LABEL}`;
}

/** "50%", "33.3%": whole numbers lose the decimal. */
export function pctText(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function flagsText(flags: readonly string[]): string {
  return flags.length ? flags.join(", ") : "None";
}

/** The sentence that says how the Combined column was made, from the weights stored with the analysis. */
export function combinedText(dto: Pick<EvidenceReportDto, "sourceType" | "weights">): string {
  if (dto.sourceType === "COMBINED" && dto.weights) {
    return `Combined = ${dto.weights.githubPct}% GitHub + ${dto.weights.docsPct}% Documents.`;
  }
  return dto.sourceType === "EDITOR" ? "Combined = 100% Documents." : "Combined = 100% GitHub.";
}

/** The note printed under Table 1. */
export function tableNote(dto: Pick<EvidenceReportDto, "memberCount" | "equalSharePct" | "sourceType" | "weights">): string {
  return (
    `An equal share for ${dto.memberCount} members is ${pctText(dto.equalSharePct)}. ${combinedText(dto)} ` +
    "Based only on recorded activity in GitHub and FAIRTRAZE Collaborative Editor. " +
    "Work done outside these platforms (such as research, design or meetings) is not counted; " +
    "members may write it in Remarks or attach it. " +
    "Flags are indicators for instructor review, not findings. This report is evidence, not a grade."
  );
}

const MANILA = "Asia/Manila";

/** "November 12, 2026, 3:05 PM" in Manila time, the same clock the rest of the app uses. */
export function manilaDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA, year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

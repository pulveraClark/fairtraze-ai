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

/** Always one decimal: "48.0%", "33.3%", "100.0%". */
export function pctText(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function flagsText(flags: readonly string[]): string {
  return flags.length ? flags.join(", ") : "None";
}

/** "Combined = 50% GitHub + 50% Documents." Only for COMBINED; the other source types have no such sentence. */
export function combinedText(dto: Pick<EvidenceReportDto, "sourceType" | "weights">): string | null {
  if (dto.sourceType === "COMBINED" && dto.weights) {
    return `Combined = ${dto.weights.githubPct}% GitHub + ${dto.weights.docsPct}% Documents.`;
  }
  return null;
}

/** The small grey note printed under Table 1; wording follows the assignment's sources. */
export function tableNote(dto: Pick<EvidenceReportDto, "memberCount" | "equalSharePct" | "sourceType" | "weights">): string {
  const basis =
    dto.sourceType === "GITHUB" ? "commits, meaningful lines and active days in GitHub"
    : dto.sourceType === "EDITOR" ? `document work in the ${EDITOR_LABEL}`
    : `commits, meaningful lines and active days in GitHub, and document work in the ${EDITOR_LABEL}`;
  const outside =
    dto.sourceType === "GITHUB" ? "outside GitHub"
    : dto.sourceType === "EDITOR" ? `outside the ${EDITOR_LABEL}`
    : "outside these platforms";
  const combined = combinedText(dto);
  return (
    `Shares are based only on recorded activity: ${basis}. ` +
    `An equal share for ${dto.memberCount} ${dto.memberCount === 1 ? "member" : "members"} is ${pctText(dto.equalSharePct)}. ` +
    (combined ? `${combined} ` : "") +
    `Work done ${outside} (such as research, design or meetings) is not counted; members may write it in Remarks or attach it. ` +
    "Flags are indicators for instructor review, not findings. This report is evidence, not a grade."
  );
}

/** "owner/repo" from a GitHub URL; "Not linked" when there is none. */
export function repoShort(repoUrl: string | null): string {
  if (!repoUrl) return "Not linked";
  const m = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(repoUrl);
  return m ? `${m[1]}/${m[2].replace(/\.git$/i, "")}` : repoUrl;
}

const MANILA = "Asia/Manila";

/** "November 12, 2026, 3:05 PM" in Manila time (the Verify box keeps the time). */
export function manilaDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA, year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

/** "November 12, 2026" in Manila time, the same clock the rest of the app uses. Date only, never a time. */
export function manilaDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: MANILA, year: "numeric", month: "long", day: "numeric" }).format(new Date(iso));
}

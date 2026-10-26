import type { AiMemberSummary, AiAddressedNote, AiFileLinks } from "@shared/aiReviewTypes";

// Mirrors the response of GET /api/groups/:id/ai-review (server/src/routes/aiReview.ts).
// Display only: nothing here is a score, and nothing here decides who may see what (the server does).

export interface AiSummaryView extends AiMemberSummary {
  name: string;
  githubUsername: string | null;
  isYou: boolean;
}

export interface AiBriefCheck {
  requirements: Array<{
    text: string;
    status: "FOUND" | "PARTLY_FOUND" | "NOT_FOUND";
    unverified: boolean;
    evidence: Array<{ type: "file" | "doc"; ref: string; quote: string; quoteHidden: boolean } & AiFileLinks>;
  }>;
  nothingFound: boolean;
  generatedAt: string;
  outdated: boolean;
  // Instructor only.
  aiAddressedCount?: number;
}

export interface AiReviewResponse {
  enabled: boolean;
  // Canonical link of the group's repository (links on file evidence are built by the server).
  repoUrl?: string | null;
  running?: boolean;
  canGenerate?: boolean;
  hasReport?: boolean;
  generatedAt?: string | null;
  basedOnReportAt?: string | null;
  outdated?: boolean;
  summaries?: AiSummaryView[] | null;
  // Instructor only.
  status?: "OK" | "PARTIAL" | "FAILED" | "SKIPPED";
  errorCode?: string | null;
  aiAddressed?: Array<AiAddressedNote & { name: string }>;
  briefFailed?: boolean;
  // Instructor and group leader only.
  briefCheck?: AiBriefCheck;
}

export const AI_POLL_MS = 5000;
export const AI_POLL_MAX_MS = 5 * 60 * 1000;

/** The summary for one report member: by user id when the report has one, else by GitHub username. */
export function summaryFor(
  data: AiReviewResponse | null,
  member: { userId?: number; githubUsername?: string | null },
): AiSummaryView | null {
  const list = data?.summaries;
  if (!data?.enabled || !list) return null;
  if (typeof member.userId === "number") return list.find((s) => s.userId === member.userId) ?? null;
  const login = member.githubUsername?.toLowerCase();
  return login ? (list.find((s) => s.githubUsername?.toLowerCase() === login) ?? null) : null;
}

export function formatBasedOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** One calm line for the Generate area; null when there is nothing to say. Instructor only. */
export function reviewStatusLine(data: AiReviewResponse | null): string | null {
  if (!data?.enabled || data.running || !data.summaries) return null;
  if (data.status === "FAILED") return "AI findings could not be written because the AI was unavailable. Changed files are shown instead. Try again later.";
  if (data.status === "PARTIAL") return "Some AI findings show changed files only, because the AI was unavailable or its wording was not used.";
  if (data.outdated) return "AI findings are from an earlier analysis. Generate again to update them.";
  return null;
}

export type WorkSummaryState = "running" | "ready" | "none";

/** Where the group's work summaries stand; null when AI review is off. Instructor views only. */
export function workSummaryState(data: AiReviewResponse | null | undefined): WorkSummaryState | null {
  if (!data?.enabled) return null;
  if (data.running) return "running";
  return data.summaries && data.summaries.length > 0 ? "ready" : "none";
}

export const WORK_SUMMARY_STATUS_TEXT: Record<WorkSummaryState, string> = {
  ready: "✓ AI findings ready · open a member below to read theirs",
  none: "AI findings not generated yet",
  running: "Writing AI findings…",
};

export const WORK_SUMMARY_CHIP_TEXT: Record<WorkSummaryState, string> = {
  ready: "✓ AI findings ready",
  none: "AI findings not generated yet",
  running: "Writing AI findings…",
};

/** Label of the one AI button; the same whether or not the class switch for member findings is on. */
export function aiButtonLabel(generating: boolean, hasExisting: boolean): string {
  if (generating) return "Generating…";
  return hasExisting ? "Regenerate AI findings" : "Generate AI findings";
}

export const AI_BUTTON_NOTE = "Also updates the AI findings below.";

/** Footer sentence saying what the AI read, by the group's source type. Neutral when the type is unknown. */
export function aiSourceLine(sourceType: string | null | undefined): string {
  if (sourceType === "GITHUB") return "Written by AI after reading the commits.";
  if (sourceType === "EDITOR") return "Written by AI after reading the Docs.";
  if (sourceType === "COMBINED") return "Written by AI after reading the commits and Docs.";
  return "Written by AI after reading the work.";
}

export function briefStatusLine(data: AiReviewResponse | null): string | null {
  if (!data?.enabled || data.running || !data.briefFailed) return null;
  return "The brief check could not run. Try again later.";
}

export function aiAddressedLine(data: AiReviewResponse | null): string | null {
  const notes = data?.aiAddressed ?? [];
  if (notes.length === 0) return null;
  const names = [...new Set(notes.map((n) => n.name))];
  return `Some text from ${names.join(", ")} appears to address the AI. It was not used.`;
}

import type { AiMemberSummary, AiAddressedNote, AiBriefSources, AiFileLinks } from "@shared/aiReviewTypes";

// Mirrors the response of GET /api/groups/:id/ai-review (server/src/routes/aiReview.ts).
// Display only: nothing here is a score, and nothing here decides who may see what (the server does).

export interface AiSummaryView extends AiMemberSummary {
  name: string;
  githubUsername: string | null;
  isYou: boolean;
}

export interface AiBriefCheck {
  requirements: Array<{
    // Identifies the requirement for "We have this" marks (a hash of its source); absent on older checks.
    key?: string;
    text: string;
    status: "FOUND" | "PARTLY_FOUND" | "NOT_FOUND";
    unverified: boolean;
    evidence: Array<{ type: "file" | "doc"; ref: string; quote: string; quoteHidden: boolean; heading?: boolean } & AiFileLinks>;
    // Where the requirement comes from: the sentence of the written brief, or the attached file's name
    // (and page). Absent on checks stored before sources were required.
    sourceQuote?: string;
    sourceFile?: string;
    sourcePage?: number;
  }>;
  nothingFound: boolean;
  // Files were attached but none could be read and there is no written brief, so nothing was checked;
  // `sources.skipped` says why. `requirements` is empty then.
  nothingRead?: boolean;
  generatedAt: string;
  outdated: boolean;
  // What was read (written brief, number of files, skipped files with reasons, and `droppedCount`: how many
  // returned requirements were left out because their source could not be confirmed). Absent on older checks.
  sources?: AiBriefSources;
  // Instructor only.
  aiAddressedCount?: number;
}

// A refresh that failed while the previous good result is still shown (instructor and leader).
export interface AiRefreshNote {
  at: string;
  shownFrom: string;
  errorCode: string;
  retryAt?: string;
}

export interface AiReviewResponse {
  enabled: boolean;
  refreshFailed?: { findings?: AiRefreshNote; brief?: AiRefreshNote };
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
  // The AI's daily limit is in force; `retryAt` (ISO) is when it resets, null when unknown.
  aiLimit?: { retryAt: string | null };
  // Instructor only: whether the project has written instructions or an attached file.
  hasInstructions?: boolean;
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

/**
 * The daily-limit sentence with the reset time on the viewer's own clock, from the server's `retryAt` (ISO).
 * Without a usable time it simply says to try later. `now` and `timeZone` are injectable for tests.
 */
export function quotaResetLine(retryAt: string | null | undefined, now: Date = new Date(), timeZone?: string): string {
  const base = "The AI's daily limit was reached.";
  const at = retryAt ? new Date(retryAt) : null;
  if (!at || Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return `${base} Try again later.`;
  const clock = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
  const hours = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 3_600_000));
  return `${base} It is available again around ${clock} (in about ${hours} ${hours === 1 ? "hour" : "hours"}).`;
}

/** True while the reset time (if known) has not passed: the Try again button stays disabled until then. */
export function quotaStillBlocked(retryAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!retryAt) return false;
  const t = Date.parse(retryAt);
  return Number.isFinite(t) && t > now.getTime();
}

/** "The last check could not be refreshed. Showing the check from Oct 26." (plus the daily-limit sentence when it applies). */
export function refreshFailedLine(note: AiRefreshNote, now: Date = new Date()): string {
  const from = formatBasedOn(note.shownFrom);
  const base = `The last check could not be refreshed.${from ? ` Showing the check from ${from}.` : ""}`;
  return note.errorCode === "AI_QUOTA_DAILY" ? `${base} ${quotaResetLine(note.retryAt, now)}` : base;
}

/** One calm line for the Generate area; null when there is nothing to say. Instructor only. */
export function reviewStatusLine(data: AiReviewResponse | null, now: Date = new Date()): string | null {
  if (!data?.enabled || data.running || !data.summaries) return null;
  if (data.status === "FAILED" && data.aiLimit) return `${quotaResetLine(data.aiLimit.retryAt, now)} Changed files are shown instead.`;
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

// The line in the AI findings card. Nothing is said before anything is generated.
export const WORK_SUMMARY_STATUS_TEXT: Record<WorkSummaryState, string | null> = {
  ready: "Select a member above to read their AI findings.",
  none: null,
  running: "Writing AI findings…",
};

export const WORK_SUMMARY_CHIP_TEXT: Record<WorkSummaryState, string> = {
  ready: "✓ AI findings ready",
  none: "AI findings not generated yet",
  running: "Writing AI findings…",
};

export const AI_SLOW_MS = 90_000;
export const AI_WRITING_HINT = "This can take up to a minute.";
// Only where the background member-findings job runs. It lives in server memory, so "usually".
export const AI_LEAVE_HINT = "You can usually leave this page; the member findings keep being written.";
export const AI_SLOW_TEXT = "This is taking longer than usual. You can try again.";
export const AI_UPDATED_TEXT = "AI findings updated";

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

export function briefStatusLine(data: AiReviewResponse | null, now: Date = new Date()): string | null {
  if (!data?.enabled || data.running || !data.briefFailed) return null;
  if (data.aiLimit) return quotaResetLine(data.aiLimit.retryAt, now);
  return "The project instructions check could not run. Try again later.";
}

export function aiAddressedLine(data: AiReviewResponse | null): string | null {
  const notes = data?.aiAddressed ?? [];
  if (notes.length === 0) return null;
  const names = [...new Set(notes.map((n) => n.name))];
  return `Some text from ${names.join(", ")} appears to address the AI. It was not used.`;
}

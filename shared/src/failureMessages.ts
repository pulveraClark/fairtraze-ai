// Plain-language wording for a failed analysis, in one place so the server (which sends it) and the client
// (which falls back to it) can never drift apart. Words only: nothing here is read by scoring, flags or the AI.
//
// Rules for every sentence: say what happened without blaming anyone, then what to do next. Raw provider or
// system text (a token name, a status line) never appears. "Re-analyze" is the real button label on the group
// cards; on the group's own report page the button reads "Re-analyze now", so the sentence still matches it.

export type AnalysisFailureCode =
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_REPO_UNREADABLE"
  | "GITHUB_NOT_CONFIGURED"
  | "GITHUB_UNREACHABLE"
  | "ANALYSIS_FAILED";

// The sentence a group member (the leader refreshing commits) gets when a repository cannot be read. Public
// repositories only for now: whether a private repository can be shared with the server's GitHub account has not
// been confirmed, so no screen promises it. (The group page's own link check still says "or ask your instructor
// how to share it"; that is a separate, older message.)
export const REPO_UNREADABLE_FOR_MEMBERS = "We couldn't read the repository. Check that the link is correct and that the repository is public.";

export const ANALYSIS_FAILURE_TEXT: Record<AnalysisFailureCode, string> = {
  GITHUB_RATE_LIMITED:
    "GitHub is limiting requests right now. Wait about an hour, then select Re-analyze. The nightly update will also try again.",
  GITHUB_REPO_UNREADABLE:
    "We couldn't read the repository. Check that the link is correct and that the repository is public, then select Re-analyze.",
  GITHUB_NOT_CONFIGURED: "GitHub access isn't set up on this server. Contact the FairTraze team.",
  GITHUB_UNREACHABLE: "We couldn't reach GitHub. Try again in a few minutes.",
  ANALYSIS_FAILED:
    "The analysis didn't finish. Try again in a few minutes. If it keeps happening, contact the FairTraze team.",
};

export function isAnalysisFailureCode(code: unknown): code is AnalysisFailureCode {
  return typeof code === "string" && code in ANALYSIS_FAILURE_TEXT;
}

/** The sentence for a known code; otherwise the given fallback, otherwise the generic one. */
export function analysisFailureText(code: unknown, fallback?: string | null): string {
  if (isAnalysisFailureCode(code)) return ANALYSIS_FAILURE_TEXT[code];
  return fallback && fallback.trim() ? fallback : ANALYSIS_FAILURE_TEXT.ANALYSIS_FAILED;
}

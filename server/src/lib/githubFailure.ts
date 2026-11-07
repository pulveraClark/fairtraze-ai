import { ANALYSIS_FAILURE_TEXT, type AnalysisFailureCode } from "@shared/failureMessages.js";

// Turns a failed GitHub read during an analysis into { status, body } with a stable `code` and one plain
// sentence. Never includes the provider's own message (`detail` used to leak "Cannot parse repoUrl" and the
// like). HTTP status stays what callers already rely on: 429 for a rate limit (the nightly run stops asking
// GitHub after one), 404 for "cannot read that repository", 502 otherwise.

export interface GithubFailure {
  status: number;
  code: AnalysisFailureCode;
}

interface GithubLikeError {
  status?: number;
  message?: string;
  response?: { headers?: Record<string, string | number | undefined> };
}

function isRateLimited(e: GithubLikeError): boolean {
  if (e.status === 429) return true;
  if (e.status !== 403) return false;
  // GitHub answers 403 both for "limit used up" and "no access to this repository"; only the first is a limit.
  const remaining = e.response?.headers?.["x-ratelimit-remaining"];
  return String(remaining) === "0" || /rate limit/i.test(e.message ?? "");
}

export function classifyGithubFailure(err: unknown): GithubFailure {
  const e = (err ?? {}) as GithubLikeError;
  if (isRateLimited(e)) return { status: 429, code: "GITHUB_RATE_LIMITED" };
  if (e.status === 404 || e.status === 403) return { status: 404, code: "GITHUB_REPO_UNREADABLE" };
  if (e.status === 401) return { status: 503, code: "GITHUB_NOT_CONFIGURED" };
  return { status: 502, code: "GITHUB_UNREACHABLE" };
}

/** The response body for a GitHub failure: a code and a plain sentence, nothing else from the provider. */
export function githubFailureBody(code: AnalysisFailureCode, extra: Record<string, unknown> = {}) {
  return { code, error: ANALYSIS_FAILURE_TEXT[code], ...extra };
}

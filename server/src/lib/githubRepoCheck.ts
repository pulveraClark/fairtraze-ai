import { Octokit } from "@octokit/rest";

// "Does this repository exist and can we read it?" for the group setup card. One metadata call
// (GET /repos/{owner}/{repo}); no commits, no diffs. Kept out of lib/github.ts so the scoring fetch is
// untouched and tests can mock this one module.

export type RepoCheckResult =
  | { status: "ok" }
  | { status: "not-found" }     // missing, or private and not readable with the server's token
  | { status: "rate-limited" }
  | { status: "no-token" }
  | { status: "unreachable" };

export async function checkRepoReachable(owner: string, repo: string, githubToken: string | undefined): Promise<RepoCheckResult> {
  if (!githubToken) return { status: "no-token" };
  try {
    const octokit = new Octokit({ auth: githubToken });
    await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
    return { status: "ok" };
  } catch (err) {
    const e = err as { status?: number; response?: { headers?: Record<string, string | number | undefined> } };
    if (e.status === 404) return { status: "not-found" };
    if (e.status === 403 || e.status === 429) {
      // 403 is either "no access" (private) or an exhausted rate limit; the header tells them apart.
      const remaining = e.response?.headers?.["x-ratelimit-remaining"];
      return String(remaining) === "0" || e.status === 429 ? { status: "rate-limited" } : { status: "not-found" };
    }
    return { status: "unreachable" };
  }
}

import { Octokit } from "@octokit/rest";

// Commit MESSAGES of a group's repo, for task linking ("FT-12" in a message). Messages only: no
// diffs, nothing that feeds scoring. Kept in its own file (not lib/github.ts) so the scoring fetch
// is untouched and tests can mock this one module.

export interface RepoCommit {
  sha: string;
  /** The full message; the linker keeps only the first line. */
  message: string;
  authorLogin: string | null;
  /** ISO timestamp. */
  committedAt: string;
}

interface CommitListItem {
  sha: string;
  parents?: unknown[];
  author?: { login?: string } | null;
  commit?: {
    message?: string;
    author?: { date?: string } | null;
    committer?: { date?: string } | null;
  };
}

/** Pages of 100 read per refresh: bounds GitHub API use (1000 newest commits). */
export const COMMIT_MESSAGE_MAX_PAGES = 10;

/**
 * The newest commits of `owner/repo` (all authors), most recent first, without merge commits (more than
 * one parent): a merge message such as "Merge branch FT-12" would otherwise link work twice, and the
 * scoring fetch skips merges for the same reason. Costs at most COMMIT_MESSAGE_MAX_PAGES API calls.
 */
export async function fetchRepoCommitMessages(
  owner: string,
  repo: string,
  githubToken: string,
  maxPages: number = COMMIT_MESSAGE_MAX_PAGES,
): Promise<RepoCommit[]> {
  const octokit = new Octokit({ auth: githubToken });
  const out: RepoCommit[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const response = await octokit.request("GET /repos/{owner}/{repo}/commits", { owner, repo, per_page: 100, page });
    const items = response.data as unknown as CommitListItem[];
    for (const item of items) {
      if ((item.parents?.length ?? 0) > 1) continue;
      const when = item.commit?.committer?.date ?? item.commit?.author?.date;
      if (!when || typeof item.commit?.message !== "string") continue;
      out.push({ sha: item.sha, message: item.commit.message, authorLogin: item.author?.login ?? null, committedAt: when });
    }
    if (items.length < 100) break;
  }
  return out;
}

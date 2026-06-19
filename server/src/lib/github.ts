import { Octokit } from "@octokit/rest";
import { classifyAddedLines } from "@shared/lineClassifier.js";

export interface GitHubContributorData {
  githubUsername: string;
  commits: number;
  additions: number;
  deletions: number;
  commitDates: string[]; // ISO timestamps, most-recent-first
  codeLinesAdded: number;
  commentLinesAdded: number;
  blankLinesAdded: number;
}

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const match = repoUrl
    .replace(/\.git$/, "")
    .match(/(?:github\.com[/:]|^)([^/]+)\/([^/]+)$/);
  if (!match) {
    throw new Error(`Cannot parse repoUrl: "${repoUrl}"`);
  }
  return { owner: match[1], repo: match[2] };
}

interface GitHubWeek {
  w: number;
  a: number;
  d: number;
  c: number;
}

interface GitHubContributorStat {
  author: { login: string } | null;
  total: number;
  weeks: GitHubWeek[];
}

interface GitHubCommitListItem {
  sha: string;
  commit: {
    author: { date?: string } | null;
    committer: { date?: string } | null;
  };
}

interface GitHubCommitDetail {
  files?: Array<{
    filename: string;
    patch?: string;
  }>;
}

async function fetchContributorStats(
  octokit: Octokit,
  owner: string,
  repo: string,
  maxRetries = 30,
  delayMs = 1000
): Promise<GitHubContributorStat[]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/stats/contributors",
      { owner, repo }
    );

    if (response.status === 200 && Array.isArray(response.data)) {
      return response.data as GitHubContributorStat[];
    }

    if (response.status === 202) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    throw new Error(`Unexpected status ${response.status} from GitHub stats API`);
  }

  throw new Error(
    `GitHub stats API did not return data after ${maxRetries} retries`
  );
}

// Returns commit dates AND SHAs (most-recent-first, all pages).
async function fetchCommitShasAndDates(
  octokit: Octokit,
  owner: string,
  repo: string,
  login: string
): Promise<{ dates: string[]; shas: string[] }> {
  const dates: string[] = [];
  const shas: string[] = [];
  let page = 1;

  while (true) {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/commits",
      { owner, repo, author: login, per_page: 100, page }
    );

    const commits = response.data as unknown as GitHubCommitListItem[];
    for (const commit of commits) {
      const date =
        commit.commit?.committer?.date ?? commit.commit?.author?.date;
      if (date) dates.push(date);
      shas.push(commit.sha);
    }

    if (commits.length < 100) break;
    page++;
  }

  return { dates, shas };
}

// Fetches per-commit diffs for the given SHAs and classifies added lines.
// Cap: caller must pass at most 50 SHAs to stay within GitHub rate limits.
async function fetchCommitDiffs(
  octokit: Octokit,
  owner: string,
  repo: string,
  shas: string[]
): Promise<{ codeLinesAdded: number; commentLinesAdded: number; blankLinesAdded: number }> {
  let codeLinesAdded = 0;
  let commentLinesAdded = 0;
  let blankLinesAdded = 0;

  for (const sha of shas) {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{ref}",
      { owner, repo, ref: sha }
    );

    const detail = response.data as GitHubCommitDetail;
    for (const file of detail.files ?? []) {
      if (!file.patch) continue;

      // Extract added lines: lines starting with '+' but not the diff header '++'
      const addedLines: string[] = [];
      for (const patchLine of file.patch.split("\n")) {
        if (patchLine.startsWith("+") && !patchLine.startsWith("++")) {
          addedLines.push(patchLine.slice(1)); // strip leading '+'
        }
      }

      if (addedLines.length > 0) {
        const counts = classifyAddedLines(file.filename, addedLines);
        codeLinesAdded += counts.code;
        commentLinesAdded += counts.comment;
        blankLinesAdded += counts.blank;
      }
    }
  }

  return { codeLinesAdded, commentLinesAdded, blankLinesAdded };
}

export async function fetchRepoStats(
  repoUrl: string,
  githubToken: string
): Promise<{ contributors: GitHubContributorData[] }> {
  const octokit = new Octokit({ auth: githubToken });
  const { owner, repo } = parseRepoUrl(repoUrl);

  const contributorStats = await fetchContributorStats(octokit, owner, repo);
  const contributors: GitHubContributorData[] = [];

  for (const contributor of contributorStats) {
    if (!contributor.author?.login) continue;
    const login = contributor.author.login;

    const additions = contributor.weeks.reduce((s, w) => s + w.a, 0);
    const deletions = contributor.weeks.reduce((s, w) => s + w.d, 0);

    const { dates: commitDates, shas } = await fetchCommitShasAndDates(
      octokit,
      owner,
      repo,
      login
    );

    // Cap diff sampling at 50 commits to stay well within the 5000 req/hr rate limit
    const shasToSample = shas.slice(0, 50);
    const lineCounts = await fetchCommitDiffs(octokit, owner, repo, shasToSample);

    contributors.push({
      githubUsername: login,
      commits: contributor.total,
      additions,
      deletions,
      commitDates,
      ...lineCounts,
    });
  }

  return { contributors };
}

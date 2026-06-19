import { Octokit } from "@octokit/rest";
import type { MemberStats, ContributorWeekStat } from "@shared/types.js";

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

async function fetchLastCommitAt(
  octokit: Octokit,
  owner: string,
  repo: string,
  login: string
): Promise<string | null> {
  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/commits",
      { owner, repo, author: login, per_page: 1 }
    );
    const commit = response.data[0];
    return (
      commit?.commit?.committer?.date ??
      commit?.commit?.author?.date ??
      null
    );
  } catch {
    return null;
  }
}

export async function fetchRepoStats(
  repoUrl: string,
  githubToken: string
): Promise<{
  stats: Omit<MemberStats, "studentName">[];
}> {
  const octokit = new Octokit({ auth: githubToken });
  const { owner, repo } = parseRepoUrl(repoUrl);

  const contributorStats = await fetchContributorStats(octokit, owner, repo);

  const stats: Omit<MemberStats, "studentName">[] = [];

  for (const contributor of contributorStats) {
    if (!contributor.author?.login) continue;
    const login = contributor.author.login;

    const weeklyBreakdown: ContributorWeekStat[] = contributor.weeks
      .filter((w) => w.c > 0 || w.a > 0 || w.d > 0)
      .map((w) => ({
        week: w.w,
        additions: w.a,
        deletions: w.d,
        commits: w.c,
      }));

    const totalAdditions = contributor.weeks.reduce((s, w) => s + w.a, 0);
    const totalDeletions = contributor.weeks.reduce((s, w) => s + w.d, 0);

    const lastCommitAt = await fetchLastCommitAt(octokit, owner, repo, login);

    stats.push({
      githubUsername: login,
      totalCommits: contributor.total,
      totalAdditions,
      totalDeletions,
      firstCommitAt: null,
      lastCommitAt,
      weeklyBreakdown,
    });
  }

  return { stats };
}

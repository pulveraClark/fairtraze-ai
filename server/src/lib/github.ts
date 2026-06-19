import { Octokit } from "@octokit/rest";

export interface GitHubContributorData {
  githubUsername: string;
  commits: number;
  additions: number;
  deletions: number;
  commitDates: string[]; // ISO timestamps, most-recent-first
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

interface GitHubCommit {
  commit: {
    author: { date?: string } | null;
    committer: { date?: string } | null;
  };
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

async function fetchAllCommitDates(
  octokit: Octokit,
  owner: string,
  repo: string,
  login: string
): Promise<string[]> {
  const dates: string[] = [];
  let page = 1;

  while (true) {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/commits",
      { owner, repo, author: login, per_page: 100, page }
    );

    const commits = response.data as unknown as GitHubCommit[];
    for (const commit of commits) {
      const date =
        commit.commit?.committer?.date ?? commit.commit?.author?.date;
      if (date) dates.push(date);
    }

    if (commits.length < 100) break;
    page++;
  }

  return dates;
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
    const commitDates = await fetchAllCommitDates(octokit, owner, repo, login);

    contributors.push({
      githubUsername: login,
      commits: contributor.total,
      additions,
      deletions,
      commitDates,
    });
  }

  return { contributors };
}

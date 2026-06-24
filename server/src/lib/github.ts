import { Octokit } from "@octokit/rest";
import { classifyAddedLines } from "@shared/lineClassifier.js";
import { getFileWeight, categorizeFile } from "@shared/fileWeights.js";
import { classifyCommit, COMMIT_IMPACT } from "@shared/commitClassifier.js";

export interface GitHubContributorData {
  githubUsername: string;
  commits: number;
  additions: number;
  deletions: number;
  commitDates: string[]; // ISO timestamps, most-recent-first
  codeLinesAdded: number;
  commentLinesAdded: number;
  blankLinesAdded: number;
  weightedAdditions: number;
  selfChurnRatio: number;
  commitImpactBreakdown: { structural: number; functional: number; cosmetic: number; trivial: number };
  fileTypeBreakdown: { source: number; test: number; docs: number; style: number; config: number; other: number };
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
    status?: string;
    additions?: number;
    deletions?: number;
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

// Fetches per-commit diffs for the given SHAs.
// Processes oldest-first for accurate self-churn tracking.
// Cap: caller must pass at most 50 SHAs.
async function fetchCommitDiffs(
  octokit: Octokit,
  owner: string,
  repo: string,
  shas: string[]
): Promise<{
  codeLinesAdded: number;
  commentLinesAdded: number;
  blankLinesAdded: number;
  weightedAdditions: number;
  selfChurnRatio: number;
  commitImpactBreakdown: { structural: number; functional: number; cosmetic: number; trivial: number };
  fileTypeBreakdown: { source: number; test: number; docs: number; style: number; config: number; other: number };
}> {
  let codeLinesAdded    = 0;
  let commentLinesAdded = 0;
  let blankLinesAdded   = 0;
  let weightedAdditions = 0;

  // Self-churn tracking: how many lines the member added to a file that were later deleted by them
  const fileAddedLines = new Map<string, number>(); // filename → running tally of lines added
  let selfDeletedTotal        = 0;
  let totalAdditionsForChurn  = 0;

  const commitImpactBreakdown = { structural: 0, functional: 0, cosmetic: 0, trivial: 0 };
  const fileTypeBreakdown     = { source: 0, test: 0, docs: 0, style: 0, config: 0, other: 0 };

  // Process oldest-first so self-churn tracking is chronologically correct
  const orderedShas = [...shas].reverse();

  for (const sha of orderedShas) {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/commits/{ref}",
      { owner, repo, ref: sha }
    );

    const detail = response.data as GitHubCommitDetail;
    const files  = detail.files ?? [];

    // Commit-level aggregates for classifyCommit
    let commitFilesChanged    = 0;
    let commitNewFilesCreated = 0;
    let commitAdditions       = 0;
    let commitDeletions       = 0;
    let commitHasSourceFiles  = false;
    let commitWeightedRaw     = 0;

    for (const file of files) {
      const filename = file.filename;
      const category = categorizeFile(filename);
      const weight   = getFileWeight(filename);

      commitFilesChanged++;
      if (file.status === "added") commitNewFilesCreated++;

      const fileAdditions = file.additions ?? 0;
      const fileDeletions = file.deletions ?? 0;
      commitAdditions += fileAdditions;
      commitDeletions += fileDeletions;

      if (category === "source" || category === "test") commitHasSourceFiles = true;

      if (!file.patch) continue;

      // Parse patch: collect added lines and count deleted lines
      const addedLines: string[] = [];
      let   patchDeletedCount = 0;
      for (const patchLine of file.patch.split("\n")) {
        if (patchLine.startsWith("+") && !patchLine.startsWith("++")) {
          addedLines.push(patchLine.slice(1));
        } else if (patchLine.startsWith("-") && !patchLine.startsWith("--")) {
          patchDeletedCount++;
        }
      }

      // Self-churn: how many of the deleted lines were previously added by this member
      const priorAdded  = fileAddedLines.get(filename) ?? 0;
      const selfDeleted = Math.min(patchDeletedCount, priorAdded);
      selfDeletedTotal += selfDeleted;
      totalAdditionsForChurn += addedLines.length;
      fileAddedLines.set(filename, Math.max(0, priorAdded - selfDeleted) + addedLines.length);

      // Weighted additions (file-type weight applied per line, multiplied by impact later)
      commitWeightedRaw += addedLines.length * weight;

      // File-type breakdown (generated files contribute 0 weight and are excluded)
      if (category !== "generated" && category in fileTypeBreakdown) {
        (fileTypeBreakdown as Record<string, number>)[category] += addedLines.length;
      }

      // Classify added lines for the meaningful-contribution signal
      if (addedLines.length > 0) {
        const counts = classifyAddedLines(filename, addedLines);
        codeLinesAdded    += counts.code;
        commentLinesAdded += counts.comment;
        blankLinesAdded   += counts.blank;
      }
    }

    // Classify commit and apply impact multiplier to this commit's weighted additions
    const impact = classifyCommit({
      filesChanged:    commitFilesChanged,
      newFilesCreated: commitNewFilesCreated,
      additions:       commitAdditions,
      deletions:       commitDeletions,
      hasSourceFiles:  commitHasSourceFiles,
    });
    commitImpactBreakdown[impact]++;
    weightedAdditions += commitWeightedRaw * COMMIT_IMPACT[impact];
  }

  const selfChurnRatio =
    totalAdditionsForChurn > 0 ? selfDeletedTotal / totalAdditionsForChurn : 0;

  return {
    codeLinesAdded,
    commentLinesAdded,
    blankLinesAdded,
    weightedAdditions,
    selfChurnRatio,
    commitImpactBreakdown,
    fileTypeBreakdown,
  };
}

export async function fetchRepoStats(
  repoUrl: string,
  githubToken: string,
  requiredLogins: string[] = []
): Promise<{ contributors: GitHubContributorData[] }> {
  const octokit = new Octokit({ auth: githubToken });
  const { owner, repo } = parseRepoUrl(repoUrl);

  const contributorStats = await fetchContributorStats(octokit, owner, repo);
  console.log(`[github] stats API returned ${contributorStats.length} contributor(s)`);

  const contributors: GitHubContributorData[] = [];
  const processedLogins = new Set<string>();

  for (const contributor of contributorStats) {
    if (!contributor.author?.login) continue;
    const login = contributor.author.login;
    processedLogins.add(login.toLowerCase());

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

  // For any required login the stats API didn't return, fetch directly.
  // The stats API is eventually consistent and can miss low-activity contributors.
  for (const login of requiredLogins) {
    if (processedLogins.has(login.toLowerCase())) continue;

    console.log(`[github] "${login}" missing from stats API — fetching directly`);

    const { dates: commitDates, shas } = await fetchCommitShasAndDates(
      octokit,
      owner,
      repo,
      login
    );

    if (shas.length === 0) {
      console.log(`[github] "${login}" has no commits — will appear as inactive`);
      continue;
    }

    const shasToSample = shas.slice(0, 50);
    const lineCounts = await fetchCommitDiffs(octokit, owner, repo, shasToSample);

    // additions/deletions come from the weekly stats breakdown in the stats API.
    // For the fallback path we derive them from the diff data instead.
    const additions = lineCounts.codeLinesAdded + lineCounts.commentLinesAdded + lineCounts.blankLinesAdded;

    console.log(`[github] "${login}" recovered: ${shas.length} commit(s) via direct fetch`);

    contributors.push({
      githubUsername: login,
      commits: shas.length,
      additions,
      deletions: 0,
      commitDates,
      ...lineCounts,
    });
  }

  return { contributors };
}

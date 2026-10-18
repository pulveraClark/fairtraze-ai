import { TASK_LIMITS } from "@shared/taskTypes.js";
import { prisma } from "./prisma.js";
import { effectiveTaskKey, TASK_KEY_PATTERN } from "./taskKey.js";
import { logActivity } from "./taskBoard.js";
import { fetchRepoCommitMessages, type RepoCommit } from "./githubCommitMessages.js";

// Links commits to tasks by the task key in the commit message ("FT-12: fix the login form").
// Planning data only: messages, never diffs; nothing here is read by scoring, the analysis or the AI
// narrative, and a failure here can never fail an analysis (see linkCommitsBestEffort).

// ── Pure helpers ───────────────────────────────────────────────────────────────

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Task numbers named in a commit message: KEY-123 for any of the group's current or earlier keys,
 * case-insensitive, not glued to a longer word ("XFT-1", "FT-1abc" and "FT-1_x" do not count). Numbers come back
 * unique and in order of appearance.
 */
export function parseTaskRefs(message: string, keys: string[]): number[] {
  const unique = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  // Longest first so "APP2" is tried before "APP".
  const alternation = unique.sort((a, b) => b.length - a.length).map(escapeRe).join("|");
  const re = new RegExp(`(?<![A-Za-z0-9_])(?:${alternation})-(\\d+)(?![A-Za-z0-9_])`, "gi");
  const found: number[] = [];
  for (const m of message.matchAll(re)) {
    const n = Number(m[1]);
    if (Number.isSafeInteger(n) && n > 0 && !found.includes(n)) found.push(n);
  }
  return found;
}

/** The first line of a commit message, trimmed and capped, as it is stored. */
export function firstLine(message: string, max = 200): string {
  const line = message.split(/\r?\n/, 1)[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** "owner/repo" from a GitHub repo URL, or null. Lower-cased, since GitHub treats names case-insensitively. */
export function parseRepoRef(repoUrl: string | null | undefined): { owner: string; repo: string; key: string } | null {
  if (!repoUrl) return null;
  const m = repoUrl.trim().replace(/\.git$/, "").replace(/\/+$/, "").match(/(?:github\.com[/:]|^)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]!, key: `${m[1]}/${m[2]}`.toLowerCase() };
}

/** Link to a commit on GitHub, or null unless the repo name and sha look safe. */
export function commitUrl(repo: string, sha: string): string | null {
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(repo) || !/^[0-9a-f]{7,64}$/i.test(sha)) return null;
  return `https://github.com/${repo}/commit/${sha}`;
}

/** Seconds until a group's next "Refresh commits" is allowed (0 when it is allowed now). */
export function refreshWaitSeconds(
  lastRefreshedAt: Date | null,
  now: Date = new Date(),
  cooldownSeconds: number = TASK_LIMITS.commitRefreshSeconds,
): number {
  if (!lastRefreshedAt) return 0;
  const left = Math.ceil((lastRefreshedAt.getTime() + cooldownSeconds * 1000 - now.getTime()) / 1000);
  return Math.max(0, left);
}

/** "4 min" / "45 seconds", for the wait message. */
export function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export type KeyCheck = { ok: true; key: string } | { ok: false; message: string };

/** A task key is 2 to 5 characters, upper-case letters and digits, starting with a letter. */
export function validateTaskKey(input: unknown): KeyCheck {
  if (typeof input !== "string") return { ok: false, message: "Enter a task key." };
  const key = input.trim().toUpperCase();
  if (!TASK_KEY_PATTERN.test(key)) {
    return { ok: false, message: "A task key is 2 to 5 letters or digits and starts with a letter, like FT or APP2." };
  }
  return { ok: true, key };
}

// ── Database ──────────────────────────────────────────────────────────────────

export interface LinkResult {
  /** Commits that named an existing task. */
  matched: number;
  /** Links created now (already-linked commits are skipped, so a repeat run adds 0). */
  linked: number;
}

/**
 * Links the given commits (already limited to this group's own repo) to the group's tasks. Only task
 * numbers that exist link. Idempotent: the unique (taskId, sha) row means a commit is linked once, and
 * History gets one "commit linked" entry per new link.
 */
export async function linkCommitsToTasks(projectId: number, repoKey: string, commits: RepoCommit[]): Promise<LinkResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      taskKey: true,
      groupName: true,
      taskKeyAliases: { select: { key: true } },
      tasks: { select: { id: true, number: true } },
    },
  });
  if (!project || project.tasks.length === 0) return { matched: 0, linked: 0 };

  const keys = [effectiveTaskKey(project), ...project.taskKeyAliases.map((a) => a.key)];
  const taskIdByNumber = new Map(project.tasks.map((t) => [t.number, t.id]));

  const candidates: { taskId: number; commit: RepoCommit }[] = [];
  const matchedShas = new Set<string>();
  for (const commit of commits) {
    for (const n of parseTaskRefs(commit.message, keys)) {
      const taskId = taskIdByNumber.get(n);
      if (taskId === undefined) continue;
      candidates.push({ taskId, commit });
      matchedShas.add(commit.sha);
    }
  }
  if (candidates.length === 0) return { matched: 0, linked: 0 };

  const existing = await prisma.taskCommitLink.findMany({
    where: { taskId: { in: [...new Set(candidates.map((c) => c.taskId))] }, sha: { in: [...matchedShas] } },
    select: { taskId: true, sha: true },
  });
  const have = new Set(existing.map((e) => `${e.taskId}:${e.sha}`));
  const fresh = candidates.filter((c) => !have.has(`${c.taskId}:${c.commit.sha}`));
  if (fresh.length === 0) return { matched: matchedShas.size, linked: 0 };

  const created = await prisma.$transaction(async (tx) => {
    const result = await tx.taskCommitLink.createMany({
      data: fresh.map((c) => ({
        taskId: c.taskId,
        repo: repoKey,
        sha: c.commit.sha,
        message: firstLine(c.commit.message),
        authorLogin: c.commit.authorLogin,
        committedAt: new Date(c.commit.committedAt),
      })),
      skipDuplicates: true,
    });
    await logActivity(tx, fresh.map((c) => ({
      taskId: c.taskId,
      actorId: null,
      type: "commit_linked" as const,
      data: { sha: c.commit.sha, authorLogin: c.commit.authorLogin },
    })));
    return result.count;
  });
  return { matched: matchedShas.size, linked: created };
}

export class CommitSyncError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export type CommitFetcher = typeof fetchRepoCommitMessages;

/** Reads the repo's recent commit messages and links them. Throws CommitSyncError with a plain message. */
export async function syncGroupCommits(
  project: { id: number; repoUrl: string | null },
  fetcher: CommitFetcher = fetchRepoCommitMessages,
): Promise<LinkResult & { scanned: number }> {
  const ref = parseRepoRef(project.repoUrl);
  if (!ref) throw new CommitSyncError("This group has no GitHub repository linked.", 400);
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new CommitSyncError("GitHub is not configured on the server.", 500);

  let commits: RepoCommit[];
  try {
    commits = await fetcher(ref.owner, ref.repo, token);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404 || status === 403) throw new CommitSyncError("GitHub repo not found or token lacks access.", 404);
    throw new CommitSyncError("Could not read commits from GitHub. Try again in a few minutes.", 502);
  }
  return { ...(await linkCommitsToTasks(project.id, ref.key, commits)), scanned: commits.length };
}

/**
 * The Analyze hook: links commits after the report is saved. Best effort: never throws, and skips the
 * GitHub call entirely when the group has no tasks, so an analysis can never fail or slow down because of it.
 */
export async function linkCommitsBestEffort(
  project: { id: number; repoUrl: string | null },
  fetcher: CommitFetcher = fetchRepoCommitMessages,
): Promise<void> {
  try {
    if (!parseRepoRef(project.repoUrl) || !process.env.GITHUB_TOKEN) return;
    if ((await prisma.task.count({ where: { projectId: project.id } })) === 0) return;
    await syncGroupCommits(project, fetcher);
  } catch (err) {
    console.error(`[taskCommitLinks] linking skipped for group ${project.id}:`, err instanceof Error ? err.message : err);
  }
}

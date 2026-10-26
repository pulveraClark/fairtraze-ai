import { Octokit } from "@octokit/rest";
import { getFileWeight } from "@shared/fileWeights.js";
import { skipReason } from "./skipRules.js";

// What we may show Gemini about one commit: message first line, changed file paths with +/- counts and
// a short excerpt of the added lines. Read-only and separate from the scoring fetch (lib/github.ts).

export const MAX_FILES_PER_COMMIT = 6;
export const MAX_ADDED_LINES_PER_FILE = 40;
export const MAX_LINE_CHARS = 160;
// Removed lines are sent only for a file that lost more lines than it gained, so a deletion-heavy commit
// can be described by what it took out.
export const MAX_REMOVED_LINES_PER_FILE = 20;
export const MAX_MESSAGE_CHARS = 300;

export interface CommitFileEvidence {
  path: string;
  added: number;
  removed: number;
  addedLines: string[];
  // Empty unless removed > added.
  removedLines: string[];
}

export interface CommitEvidence {
  sha: string;
  message: string; // the whole message, cut at MAX_MESSAGE_CHARS
  authorLogin: string | null;
  files: CommitFileEvidence[];
  // Changed files left out (generated, lock, binary, secret-named, or past the per-commit cap).
  skippedFiles: number;
}

export interface RawCommitFile {
  filename: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}

function addedLinesOf(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("++")) out.push(line.slice(1));
  }
  return out;
}

function removedLinesOf(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split("\n")) {
    if (line.startsWith("-") && !line.startsWith("--")) out.push(line.slice(1));
  }
  return out;
}

const keepLines = (lines: string[], max: number) =>
  lines
    .filter((l) => l.trim() !== "")
    .slice(0, max)
    .map((l) => (l.length > MAX_LINE_CHARS ? l.slice(0, MAX_LINE_CHARS) : l));

export function condenseCommit(raw: {
  sha: string;
  message: string;
  authorLogin: string | null;
  files: RawCommitFile[];
}): CommitEvidence {
  const kept: Array<CommitFileEvidence & { weight: number }> = [];
  let skipped = 0;
  for (const f of raw.files) {
    const reason = skipReason(f.filename, { hasPatch: !!f.patch, patchChars: f.patch?.length ?? 0 });
    if (reason) {
      skipped++;
      continue;
    }
    const lines = addedLinesOf(f.patch ?? "");
    const added = f.additions ?? lines.length;
    const removed = f.deletions ?? 0;
    kept.push({
      path: f.filename,
      added,
      removed,
      addedLines: keepLines(lines, MAX_ADDED_LINES_PER_FILE),
      removedLines: removed > added ? keepLines(removedLinesOf(f.patch ?? ""), MAX_REMOVED_LINES_PER_FILE) : [],
      // A removal-only file would weigh 0 and sort last (or be cut by the per-commit cap): count the
      // lines it removed, so a deletion-heavy commit keeps its files.
      weight: getFileWeight(f.filename) * Math.max(added, removed),
    });
  }
  kept.sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path));
  const top = kept.slice(0, MAX_FILES_PER_COMMIT);
  skipped += kept.length - top.length;
  return {
    sha: raw.sha,
    message: raw.message.trim().slice(0, MAX_MESSAGE_CHARS),
    authorLogin: raw.authorLogin,
    files: top.map(({ weight: _weight, ...file }) => file),
    skippedFiles: skipped,
  };
}

// One GitHub call per commit (single-commit endpoint). Callers only ask for commits that are not
// already digested, so a re-run costs calls for new commits only.
export async function fetchCommitEvidence(
  owner: string,
  repo: string,
  githubToken: string,
  sha: string,
): Promise<CommitEvidence> {
  const octokit = new Octokit({ auth: githubToken });
  const res = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", { owner, repo, ref: sha });
  const data = res.data as unknown as {
    sha: string;
    author?: { login?: string } | null;
    commit: { message: string };
    files?: RawCommitFile[];
  };
  return condenseCommit({
    sha: data.sha,
    message: data.commit.message,
    authorLogin: data.author?.login ?? null,
    files: data.files ?? [],
  });
}

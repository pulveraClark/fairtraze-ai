import { createHash } from "node:crypto";
import { checkRepoUrl } from "@shared/repoUrl.js";
import type { AiEvidenceLink } from "@shared/aiReviewTypes.js";

// Links from AI-review file evidence to GitHub. Display only: nothing here is read by scoring.

export interface RepoRef {
  owner: string;
  repo: string;
}

/** owner/repo from a stored repository link; null when there is none or it is not a GitHub link. */
export function repoRefOf(repoUrl: string | null | undefined): RepoRef | null {
  if (!repoUrl) return null;
  const checked = checkRepoUrl(repoUrl);
  return checked.ok ? { owner: checked.owner, repo: checked.repo } : null;
}

export function canonicalRepoUrl(ref: RepoRef | null): string | null {
  return ref ? `https://github.com/${ref.owner}/${ref.repo}` : null;
}

const SHA = /^[0-9a-f]{7,64}$/i;

/** GitHub anchors a file inside a commit's diff as #diff-<sha256 hex of the file path>. */
export function diffAnchor(path: string): string {
  return `diff-${createHash("sha256").update(path).digest("hex")}`;
}

export function commitUrl(ref: RepoRef, sha: string, path?: string): string {
  return `https://github.com/${ref.owner}/${ref.repo}/commit/${sha}${path ? `#${diffAnchor(path)}` : ""}`;
}

/** The file on the default branch: used when no commit that touched it is known. */
export function fileUrl(ref: RepoRef, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${ref.owner}/${ref.repo}/blob/HEAD/${encoded}`;
}

/** The file at one commit, with the quoted lines highlighted when they are known. */
export function blobUrl(ref: RepoRef, sha: string, path: string, lines?: readonly [number, number]): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const anchor = lines && lines[0] >= 1 && lines[1] >= lines[0] ? (lines[1] === lines[0] ? `#L${lines[0]}` : `#L${lines[0]}-L${lines[1]}`) : "";
  return `https://github.com/${ref.owner}/${ref.repo}/blob/${sha}/${encoded}${anchor}`;
}

/**
 * Brief check, code proof read at a pinned commit: the file at that commit (not a commit diff), with the quoted
 * lines when known. Null when there is no pinned commit (older checks), so the caller keeps the commit link.
 */
export function linkFileAtCommit(
  ref: RepoRef | null, path: string, sha: string | undefined, lines?: readonly [number, number],
): { href: string; isCommit: false; lines?: [number, number] } | null {
  if (!ref || !path || !sha || !SHA.test(sha)) return null;
  const ok = lines && lines[0] >= 1 && lines[1] >= lines[0];
  return { href: blobUrl(ref, sha, path, ok ? lines : undefined), isCommit: false, ...(ok ? { lines: [lines![0], lines![1]] as [number, number] } : {}) };
}

export interface FileLinks {
  /** The newest commit's diff anchored to this file, or the file itself when no commit is known. */
  href: string;
  /** True when href is a commit diff (false: the file on the default branch). */
  isCommit: boolean;
  /** The other commits that touched the file, newest first. */
  more: AiEvidenceLink[];
}

/** Links for one file. `shas` are newest first; unknown or malformed shas are ignored. */
export function linkFile(ref: RepoRef | null, path: string, shas: readonly string[] | undefined): FileLinks | null {
  if (!ref || !path) return null;
  const clean = [...new Set((shas ?? []).filter((s) => SHA.test(s)))];
  if (clean.length === 0) return { href: fileUrl(ref, path), isCommit: false, more: [] };
  return {
    href: commitUrl(ref, clean[0]!, path),
    isCommit: true,
    more: clean.slice(1).map((sha) => ({ sha: sha.slice(0, 7), href: commitUrl(ref, sha, path) })),
  };
}

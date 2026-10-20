// GitHub repository link check shared by the setup card (live format check) and the server route that
// saves the link. Display/validation only - never read by scoring.

export const REPO_URL_EXAMPLE = "https://github.com/owner/repo";

export type RepoUrlCheck =
  | { ok: true; owner: string; repo: string; url: string }
  | { ok: false; message: string };

const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Accepts https://github.com/owner/repo, with or without https://, www., a trailing slash or ".git".
 * Returns the canonical link (https://github.com/owner/repo) or a message that says what to change.
 */
export function checkRepoUrl(input: string): RepoUrlCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, message: "Paste the link to your GitHub repository." };

  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i);
  if (!m) {
    return { ok: false, message: `That is not a GitHub link. It should look like ${REPO_URL_EXAMPLE}.` };
  }

  const parts = m[1]!.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return { ok: false, message: `Add the repository name after the owner, like ${REPO_URL_EXAMPLE}.` };
  }
  if (parts.length > 2) {
    return {
      ok: false,
      message: `Use the link to the repository itself, like ${REPO_URL_EXAMPLE}. Remove everything after the repository name.`,
    };
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  if (!NAME.test(owner) || !repo || !NAME.test(repo)) {
    return { ok: false, message: "The owner and repository name can only use letters, numbers, dots, dashes and underscores." };
  }
  return { ok: true, owner, repo, url: `https://github.com/${owner}/${repo}` };
}

/** Same repository? GitHub treats owner and repo names case-insensitively. */
export function sameRepo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = checkRepoUrl(a);
  const y = checkRepoUrl(b);
  return x.ok && y.ok && x.url.toLowerCase() === y.url.toLowerCase();
}

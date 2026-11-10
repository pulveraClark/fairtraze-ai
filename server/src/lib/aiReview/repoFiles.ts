import { Octokit } from "@octokit/rest";

// Read-only repository reads for the brief check: the file list and the text of a few files.
// Separate from the scoring fetch (lib/github.ts). Skip rules are applied by the caller.

export const MAX_FILE_BYTES = 200_000;

/** The commit the default branch points to right now (one call), or null when it cannot be read. */
export async function fetchHeadSha(owner: string, repo: string, githubToken: string): Promise<string | null> {
  const octokit = new Octokit({ auth: githubToken });
  const res = await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", { owner, repo, ref: "HEAD", per_page: 1 });
  const sha = (res.data as unknown as { sha?: string }).sha;
  return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

/** `ref` (a commit sha) pins the read to one commit; without it the default branch's current head is read. */
export async function fetchRepoTree(owner: string, repo: string, githubToken: string, ref?: string): Promise<string[]> {
  const octokit = new Octokit({ auth: githubToken });
  const res = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
    owner, repo, tree_sha: ref ?? "HEAD", recursive: "1",
  });
  const tree = (res.data as unknown as { tree?: Array<{ path?: string; type?: string; size?: number }> }).tree ?? [];
  return tree
    .filter((t) => t.type === "blob" && typeof t.path === "string" && (t.size ?? 0) <= MAX_FILE_BYTES)
    .map((t) => t.path!);
}

export async function fetchRepoFileText(owner: string, repo: string, githubToken: string, path: string, ref?: string): Promise<string | null> {
  const octokit = new Octokit({ auth: githubToken });
  const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path, ...(ref ? { ref } : {}) });
  const data = res.data as unknown as { content?: string; encoding?: string; size?: number };
  if (typeof data.content !== "string" || data.encoding !== "base64" || (data.size ?? 0) > MAX_FILE_BYTES) return null;
  const text = Buffer.from(data.content, "base64").toString("utf8");
  return text.includes("\u0000") ? null : text; // binary
}

import { Octokit } from "@octokit/rest";

// Read-only repository reads for the brief check: the file list and the text of a few files.
// Separate from the scoring fetch (lib/github.ts). Skip rules are applied by the caller.

export const MAX_FILE_BYTES = 200_000;

export async function fetchRepoTree(owner: string, repo: string, githubToken: string): Promise<string[]> {
  const octokit = new Octokit({ auth: githubToken });
  const res = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
    owner, repo, tree_sha: "HEAD", recursive: "1",
  });
  const tree = (res.data as unknown as { tree?: Array<{ path?: string; type?: string; size?: number }> }).tree ?? [];
  return tree
    .filter((t) => t.type === "blob" && typeof t.path === "string" && (t.size ?? 0) <= MAX_FILE_BYTES)
    .map((t) => t.path!);
}

export async function fetchRepoFileText(owner: string, repo: string, githubToken: string, path: string): Promise<string | null> {
  const octokit = new Octokit({ auth: githubToken });
  const res = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path });
  const data = res.data as unknown as { content?: string; encoding?: string; size?: number };
  if (typeof data.content !== "string" || data.encoding !== "base64" || (data.size ?? 0) > MAX_FILE_BYTES) return null;
  const text = Buffer.from(data.content, "base64").toString("utf8");
  return text.includes("\u0000") ? null : text; // binary
}

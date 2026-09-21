import { describe, it, expect, vi } from "vitest";

// The global setupFile (test/setupEnv.ts) mocks this whole module for every other test
// file, since real GitHub calls must never happen from the test suite. This file is the
// one place that needs the real implementation (driven by a stub Octokit, never real
// network I/O) to exercise the cache itself, so undo that mock just here.
vi.unmock("./github.js");

import type { Octokit } from "@octokit/rest";
import { fetchCommitDiffs } from "./github.js";
import { prisma } from "./prisma.js";

interface FakeFile {
  filename: string;
  status?: string;
  additions?: number;
  deletions?: number;
  patch?: string;
}

// Builds a stub Octokit whose `request` resolves canned per-SHA file data and records
// every call, so tests can assert exactly which SHAs actually hit "GitHub".
function stubOctokit(filesBySha: Record<string, FakeFile[]>) {
  const calls: string[] = [];
  const request = vi.fn(async (_route: string, params: { ref: string }) => {
    calls.push(params.ref);
    return { data: { files: filesBySha[params.ref] ?? [] } };
  });
  return { octokit: { request } as unknown as Octokit, calls };
}

const FILES_A: Record<string, FakeFile[]> = {
  sha1: [{ filename: "src/foo.ts", status: "modified", additions: 2, deletions: 0, patch: "@@ -0,0 +1,2 @@\n+const a = 1;\n+const b = 2;" }],
  sha2: [{ filename: "src/bar.ts", status: "added", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+const c = 3;" }],
  sha3: [{ filename: "README.md", status: "modified", additions: 1, deletions: 0, patch: "@@ -1,0 +1 @@\n+docs line" }],
};

describe("fetchCommitDiffs commit-diff cache", () => {
  it("cache miss: fetches from GitHub and populates CachedCommitDiff", async () => {
    const { octokit, calls } = stubOctokit(FILES_A);

    const result = await fetchCommitDiffs(octokit, "acme", "widgets-miss", ["sha2", "sha1"]);

    expect(calls.sort()).toEqual(["sha1", "sha2"]);
    expect(result.codeLinesAdded).toBeGreaterThan(0);

    const rows = await prisma.cachedCommitDiff.findMany({ where: { repo: "acme/widgets-miss" } });
    expect(rows.map((r) => r.sha).sort()).toEqual(["sha1", "sha2"]);
    expect(JSON.parse(rows.find((r) => r.sha === "sha1")!.files)).toEqual(FILES_A.sha1);
  });

  it("cache hit: a second call for the same repo+SHAs makes zero GitHub requests and returns identical output", async () => {
    const first = stubOctokit(FILES_A);
    const resultFresh = await fetchCommitDiffs(first.octokit, "acme", "widgets-hit", ["sha2", "sha1"]);
    expect(first.calls.length).toBe(2);

    const second = stubOctokit(FILES_A);
    const resultCached = await fetchCommitDiffs(second.octokit, "acme", "widgets-hit", ["sha2", "sha1"]);

    expect(second.calls.length).toBe(0);
    expect(resultCached).toEqual(resultFresh);
  });

  it("mixed hit/miss: only the uncached SHA is fetched, and the result matches a fully-fresh run", async () => {
    const warm = stubOctokit(FILES_A);
    await fetchCommitDiffs(warm.octokit, "acme", "widgets-mixed", ["sha2", "sha1"]);

    const mixed = stubOctokit(FILES_A);
    const resultMixed = await fetchCommitDiffs(mixed.octokit, "acme", "widgets-mixed", ["sha3", "sha2", "sha1"]);
    expect(mixed.calls).toEqual(["sha3"]);

    const fresh = stubOctokit(FILES_A);
    const resultFresh = await fetchCommitDiffs(fresh.octokit, "acme", "widgets-mixed-control", ["sha3", "sha2", "sha1"]);
    expect(fresh.calls.sort()).toEqual(["sha1", "sha2", "sha3"]);

    expect(resultMixed).toEqual(resultFresh);
  });

  it("scopes the cache by repo: the same SHA in a different repo is fetched independently", async () => {
    const repoA = stubOctokit({ deadbeef: FILES_A.sha1 });
    await fetchCommitDiffs(repoA.octokit, "acme", "repo-a", ["deadbeef"]);

    const otherFiles = [{ filename: "totally-different.txt", status: "added", additions: 5, deletions: 0, patch: "@@ -0,0 +1,5 @@\n+x\n+x\n+x\n+x\n+x" }];
    const repoB = stubOctokit({ deadbeef: otherFiles });
    const resultB = await fetchCommitDiffs(repoB.octokit, "acme", "repo-b", ["deadbeef"]);

    expect(repoB.calls).toEqual(["deadbeef"]);
    expect(resultB.codeLinesAdded).toBe(5);
  });
});

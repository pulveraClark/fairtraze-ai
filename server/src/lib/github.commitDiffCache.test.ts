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

  it("filesChanged counts distinct filenames across the sampled commits (progress display only)", async () => {
    const touchesFooAgain = [{ filename: "src/foo.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+const z = 0;" }];
    const { octokit } = stubOctokit({ ...FILES_A, sha4: touchesFooAgain });

    const result = await fetchCommitDiffs(octokit, "acme", "widgets-files", ["sha4", "sha3", "sha2", "sha1"]);

    // foo.ts (sha1, sha4), bar.ts (sha2), README.md (sha3) → 3 distinct
    expect(result.filesChanged).toBe(3);
  });
});

// fetchRepoStats builds its own Octokit, so stub the constructor to drive it without network I/O.
describe("fetchRepoStats onProgress", () => {
  it("reports cumulative contributors/commits/files after each contributor, and never reports scores", async () => {
    vi.resetModules();
    const filesBySha: Record<string, FakeFile[]> = {
      s1: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+x" }],
      s2: [{ filename: "b.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+y" }],
    };
    vi.doMock("@octokit/rest", () => ({
      Octokit: class {
        async request(route: string, params: { author?: string; ref?: string }) {
          if (route.includes("stats/contributors")) {
            return {
              status: 200,
              data: [
                { author: { login: "ann" }, total: 1, weeks: [{ w: 0, a: 1, d: 0, c: 1 }] },
                { author: { login: "bob" }, total: 1, weeks: [{ w: 0, a: 1, d: 0, c: 1 }] },
              ],
            };
          }
          if (route.endsWith("/commits")) {
            const sha = params.author === "ann" ? "s1" : "s2";
            return { data: [{ sha, commit: { author: { date: "2026-01-01T00:00:00Z" }, committer: { date: "2026-01-01T00:00:00Z" } } }] };
          }
          return { data: { files: filesBySha[params.ref ?? ""] ?? [] } };
        }
      },
    }));
    const { fetchRepoStats } = await import("./github.js");

    const seen: Array<{ contributors: number; commits: number; files: number }> = [];
    const result = await fetchRepoStats("https://github.com/acme/progress-repo", "token", [], (p) => seen.push(p));

    expect(seen).toEqual([
      { contributors: 1, commits: 1, files: 1, member: { login: "ann", commits: 1, commitDates: ["2026-01-01T00:00:00Z"] } },
      { contributors: 2, commits: 2, files: 2, member: { login: "bob", commits: 1, commitDates: ["2026-01-01T00:00:00Z"] } },
    ]);
    expect(result.contributors).toHaveLength(2);
    vi.doUnmock("@octokit/rest");
  });
});

// Merge commits (2+ parents) repeat the merged branch's work, so they must be excluded from every
// per-member input: sample, diffs, line totals, impact counts, commit dates and the fallback count.
describe("fetchRepoStats merge-commit exclusion", () => {
  type ListItem = { sha: string; parents: Array<{ sha: string }>; date: string };
  const one = [{ sha: "p" }];
  const two = [{ sha: "p1" }, { sha: "p2" }];
  const FILE = (name: string, lines: number, status = "modified"): FakeFile => ({
    filename: name, status, additions: lines, deletions: 0,
    patch: `@@ -0,0 +1,${lines} @@\n${Array.from({ length: lines }, () => "+const x = 1;").join("\n")}`,
  });

  async function run(list: ListItem[], filesBySha: Record<string, FakeFile[]>, opts: { required?: string[]; stats?: boolean } = {}) {
    vi.resetModules();
    const diffCalls: string[] = [];
    vi.doMock("@octokit/rest", () => ({
      Octokit: class {
        async request(route: string, params: { ref?: string; page?: number }) {
          if (route.includes("stats/contributors")) {
            return { status: 200, data: opts.stats === false ? [] : [{ author: { login: "lead" }, total: list.filter((c) => c.parents.length < 2).length, weeks: [{ w: 0, a: 1, d: 0, c: 1 }] }] };
          }
          if (route.endsWith("/commits")) {
            const page = params.page ?? 1;
            const slice = list.slice((page - 1) * 100, page * 100);
            return { data: slice.map((c) => ({ sha: c.sha, parents: c.parents, commit: { author: { date: c.date }, committer: { date: c.date } } })) };
          }
          diffCalls.push(params.ref ?? "");
          return { data: { files: filesBySha[params.ref ?? ""] ?? [] } };
        }
      },
    }));
    const { fetchRepoStats } = await import("./github.js");
    const repo = `merge-${Math.random().toString(36).slice(2)}`;
    const result = await fetchRepoStats(`https://github.com/acme/${repo}`, "token", opts.required ?? []);
    vi.doUnmock("@octokit/rest");
    return { member: result.contributors[0], diffCalls };
  }

  const sum = (b: Record<string, number>) => Object.values(b).reduce((s, v) => s + v, 0);

  it("skips a 2-parent merge: not fetched, and absent from lines, file types, impact, weighted lines and dates", async () => {
    const mergeFiles = Array.from({ length: 8 }, (_, i) => FILE(`teammate${i}.ts`, 50, "added"));
    const { member, diffCalls } = await run(
      [
        { sha: "n1", parents: one, date: "2026-01-03T00:00:00Z" },
        { sha: "m1", parents: two, date: "2026-01-02T00:00:00Z" },
        { sha: "n2", parents: one, date: "2026-01-01T00:00:00Z" },
      ],
      { n1: [FILE("a.ts", 2)], n2: [FILE("b.ts", 3)], m1: mergeFiles },
    );
    expect(diffCalls.sort()).toEqual(["n1", "n2"]);
    expect(sum(member.commitImpactBreakdown)).toBe(2);
    expect(member.commitImpactBreakdown.structural).toBe(0);
    expect(member.codeLinesAdded).toBe(5);
    expect(member.fileTypeBreakdown.source).toBe(5);
    expect(member.weightedAdditions).toBe(5);
    expect(member.commitDates).toEqual(["2026-01-03T00:00:00Z", "2026-01-01T00:00:00Z"]);
    expect(member.filesChanged).toBe(2);
    // The analyzed total now matches the stats-API commit count (which also excludes merges).
    expect(sum(member.commitImpactBreakdown)).toBe(member.commits);
  });

  it("keeps a single-parent (squash) merge", async () => {
    const { member, diffCalls } = await run(
      [{ sha: "sq", parents: one, date: "2026-01-02T00:00:00Z" }, { sha: "n1", parents: one, date: "2026-01-01T00:00:00Z" }],
      { sq: [FILE("a.ts", 4)], n1: [FILE("b.ts", 1)] },
    );
    expect(diffCalls.sort()).toEqual(["n1", "sq"]);
    expect(sum(member.commitImpactBreakdown)).toBe(2);
    expect(member.codeLinesAdded).toBe(5);
  });

  it("applies the 100-commit sample cap after filtering merges", async () => {
    // 60 merges interleaved first, then 110 real commits: the sample must be 100 real commits.
    const list: ListItem[] = [];
    const filesBySha: Record<string, FakeFile[]> = {};
    for (let i = 0; i < 60; i++) list.push({ sha: `m${i}`, parents: two, date: "2026-02-01T00:00:00Z" });
    for (let i = 0; i < 110; i++) {
      list.push({ sha: `n${i}`, parents: one, date: "2026-01-01T00:00:00Z" });
      filesBySha[`n${i}`] = [FILE("a.ts", 1)];
    }
    const { member, diffCalls } = await run(list, filesBySha);
    expect(diffCalls).toHaveLength(100);
    expect(diffCalls.every((s) => s.startsWith("n"))).toBe(true);
    expect(sum(member.commitImpactBreakdown)).toBe(100);
    expect(member.commitDates).toHaveLength(110);
  });

  it("required-login fallback excludes merges from the commit count and analysis", async () => {
    const { member, diffCalls } = await run(
      [
        { sha: "m1", parents: two, date: "2026-01-02T00:00:00Z" },
        { sha: "n1", parents: one, date: "2026-01-01T00:00:00Z" },
      ],
      { n1: [FILE("a.ts", 2)], m1: [FILE("x.ts", 90, "added")] },
      { required: ["lead"], stats: false },
    );
    expect(member.githubUsername).toBe("lead");
    expect(member.commits).toBe(1);
    expect(diffCalls).toEqual(["n1"]);
    expect(sum(member.commitImpactBreakdown)).toBe(1);
  });
});

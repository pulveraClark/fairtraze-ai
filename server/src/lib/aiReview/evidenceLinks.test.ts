import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { canonicalRepoUrl, commitUrl, diffAnchor, fileUrl, linkFile, repoRefOf } from "./evidenceLinks.js";
import { mergeFiles } from "./facts.js";
import { shapeBriefForViewer, shapeSummariesForViewer } from "../../routes/aiReview.js";
import type { AiBriefContent, AiMemberSummariesContent } from "@shared/aiReviewTypes.js";

const repo = repoRefOf("https://github.com/example/Trips.git")!;
const sha1 = "a41f9c2d0e5b7c8f1234567890abcdef12345678";
const sha2 = "b52e0d3e1f6c8d9a2345678901bcdef023456789";
const sha3 = "c63f1e4f207d9eab3456789012cdef0134567890";

describe("evidence link URLs", () => {
  it("builds owner/repo/sha with the file's diff anchor (sha256 of the path)", () => {
    const expected = createHash("sha256").update("src/Graphhopper.py").digest("hex");
    expect(diffAnchor("src/Graphhopper.py")).toBe(`diff-${expected}`);
    expect(commitUrl(repo, sha1, "src/Graphhopper.py")).toBe(`https://github.com/example/Trips/commit/${sha1}#diff-${expected}`);
    expect(commitUrl(repo, sha1)).toBe(`https://github.com/example/Trips/commit/${sha1}`);
    expect(canonicalRepoUrl(repo)).toBe("https://github.com/example/Trips");
  });

  it("hashes the exact path, so unicode and spaces anchor correctly", () => {
    const path = "docs/Ünit plan #1.md";
    expect(diffAnchor(path)).toBe(`diff-${createHash("sha256").update(path).digest("hex")}`);
  });

  it("links the newest commit and lists the rest as +N more, newest first", () => {
    const l = linkFile(repo, "a.ts", [sha1, sha2, sha3])!;
    expect(l.isCommit).toBe(true);
    expect(l.href).toBe(commitUrl(repo, sha1, "a.ts"));
    expect(l.more).toEqual([
      { sha: sha2.slice(0, 7), href: commitUrl(repo, sha2, "a.ts") },
      { sha: sha3.slice(0, 7), href: commitUrl(repo, sha3, "a.ts") },
    ]);
  });

  it("falls back to the file on the default branch when no commit is known, ignores bad shas, and links nothing without a repo", () => {
    expect(linkFile(repo, "src/My File.py", undefined)).toEqual({ href: "https://github.com/example/Trips/blob/HEAD/src/My%20File.py", isCommit: false, more: [] });
    expect(linkFile(repo, "a.ts", ["not a sha", "../../evil"])!.isCommit).toBe(false);
    expect(fileUrl(repo, "a#b/c.ts")).toBe("https://github.com/example/Trips/blob/HEAD/a%23b/c.ts");
    expect(linkFile(null, "a.ts", [sha1])).toBeNull();
    expect(repoRefOf(null)).toBeNull();
    expect(repoRefOf("https://example.com/x/y")).toBeNull();
  });
});

describe("mergeFiles keeps the commits behind each file", () => {
  it("collects shas per file in the order given (newest first)", () => {
    const merged = mergeFiles([
      { sha: sha1, files: [{ path: "a.ts", added: 1, removed: 0 }] },
      { sha: sha2, files: [{ path: "a.ts", added: 2, removed: 1 }, { path: "b.ts", added: 1, removed: 0 }] },
    ]);
    expect(merged.find((f) => f.path === "a.ts")).toMatchObject({ added: 3, removed: 1, commits: [sha1, sha2] });
    expect(merged.find((f) => f.path === "b.ts")!.commits).toEqual([sha2]);
  });
});

describe("API shaping adds links for every viewer and never changes who sees what", () => {
  const summaries: AiMemberSummariesContent = {
    aiAddressed: [],
    members: [
      { userId: 1, summary: "Added x.", source: "ai", evidence: { files: [{ path: "a.ts", added: 3, removed: 1, commits: [sha1, sha2] }], docSections: ["Intro"], commitCount: 2, otherCommits: 0 } },
      { userId: 2, summary: "Added y.", source: "ai", evidence: { files: [{ path: "b.ts", added: 1, removed: 0 }], docSections: [], commitCount: 1, otherCommits: 0 } },
    ],
  };
  const people = new Map([[1, { name: "Ana", githubUsername: "ana" }], [2, { name: "Ben", githubUsername: "ben" }]]);

  it("member sees only their own summary, with links and without the raw shas", () => {
    const out = shapeSummariesForViewer(summaries, "member", 1, people, repo);
    expect(out.summaries.map((s) => s.userId)).toEqual([1]);
    const f = out.summaries[0]!.evidence.files[0]!;
    expect(f.href).toBe(commitUrl(repo, sha1, "a.ts"));
    expect(f.more).toHaveLength(1);
    expect(f).not.toHaveProperty("commits");
  });

  it("leader and instructor see everyone; a file with no known commit links to the file; no repo means no links", () => {
    const lead = shapeSummariesForViewer(summaries, "leader", 1, people, repo);
    expect(lead.summaries).toHaveLength(2);
    expect(lead.summaries[1]!.evidence.files[0]!.href).toBe(fileUrl(repo, "b.ts"));
    expect(shapeSummariesForViewer(summaries, "instructor", 9, people, repo).aiAddressed).toEqual([]);
    expect(shapeSummariesForViewer(summaries, "instructor", 9, people, null).summaries[0]!.evidence.files[0]).not.toHaveProperty("href");
  });

  it("brief check: file evidence gets links; Docs quotes stay hidden from a leader for others' text", () => {
    const content: AiBriefContent = {
      aiAddressedCount: 0,
      requirements: [{
        text: "Saves trips", status: "FOUND",
        evidence: [
          { type: "file", ref: "a.ts", quote: "save()", commits: [sha1] },
          { type: "doc", ref: "Intro", quote: "Other member wrote this", authors: [2] },
        ],
      }],
    };
    const row = { status: "OK", content, promptVersion: "brief-1", briefHash: null, reportId: 1, createdAt: new Date() };
    const view = shapeBriefForViewer(row, "leader", 1, { brief: "x", latestReportId: 1 }, repo)!;
    const [file, doc] = view.requirements[0]!.evidence;
    expect(file).toMatchObject({ href: commitUrl(repo, sha1, "a.ts"), isCommit: true, quote: "save()" });
    expect(doc).toMatchObject({ quote: "", quoteHidden: true });
    expect(doc).not.toHaveProperty("href");
  });
});

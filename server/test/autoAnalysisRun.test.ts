import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { runAutoAnalysis, type AutoRunDeps } from "../src/lib/autoAnalysis.js";
import { tryAcquireAnalysis, releaseAnalysis } from "../src/lib/analysisLock.js";
import { createUser, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

// No report yet means "changed", so every group below is due without any GitHub call.
async function group(sourceType: "GITHUB" | "EDITOR") {
  const { user } = await createUser();
  const cs = await createClassSection(user.id);
  const asg = await createAssignment(cs.id, { sourceType });
  const project = await createProject({ assignmentId: asg.id, repoUrl: sourceType === "EDITOR" ? null : "https://github.com/example/repo" });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  await createMembership(student.id, project.id, "LEADER");
  return project;
}

const ok = { status: 200, body: {}, streamed: false };

const deps = (analyze: AutoRunDeps["analyze"]): AutoRunDeps => ({
  change: { latestCommitAt: async () => null, githubToken: "t" },
  analyze,
  log: () => {},
});

describe("runAutoAnalysis", () => {
  it("one failed group does not stop the others, and groups run one at a time", async () => {
    const a = await group("GITHUB");
    const b = await group("GITHUB");
    const c = await group("GITHUB");
    let active = 0;
    let maxActive = 0;
    const seen: number[] = [];
    const summary = await runAutoAnalysis(new Date(), deps(async (id) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      seen.push(id);
      if (id === b.id) throw new Error("boom");
      return ok;
    }));
    expect(seen).toEqual([a.id, b.id, c.id]);
    expect(maxActive).toBe(1);
    expect(summary).toMatchObject({ analyzed: 2, failed: 1, skipped: 0 });
  });

  it("after a GitHub rate limit the remaining GitHub groups are skipped, Docs-only groups still run", async () => {
    const a = await group("GITHUB");
    const b = await group("GITHUB");
    const docs = await group("EDITOR");
    const seen: number[] = [];
    const summary = await runAutoAnalysis(new Date(), deps(async (id) => {
      seen.push(id);
      return id === a.id ? { status: 429, body: {}, streamed: false } : ok;
    }));
    expect(seen).toEqual([a.id, docs.id]);
    expect(seen).not.toContain(b.id);
    expect(summary).toMatchObject({ analyzed: 1, skipped: 2, skippedRateLimited: 2, failed: 0 });
  });

  it("a group already being analyzed is skipped as busy", async () => {
    const a = await group("EDITOR");
    expect(tryAcquireAnalysis(a.id)).toBe(true);
    try {
      const summary = await runAutoAnalysis(new Date(), deps(async () => ({ status: 409, body: {}, streamed: false })));
      expect(summary).toMatchObject({ analyzed: 0, skippedLocked: 1 });
    } finally {
      releaseAnalysis(a.id);
    }
  });

  it("a group with a current report and nothing new is not analyzed", async () => {
    const a = await group("EDITOR");
    await prisma.report.create({ data: { projectId: a.id, generatedAt: new Date(), content: JSON.stringify({ report: {}, scoringRulesVersion: 99 }) } });
    let calls = 0;
    const summary = await runAutoAnalysis(new Date(), deps(async () => { calls++; return ok; }));
    expect(calls).toBe(0);
    expect(summary).toMatchObject({ analyzed: 0, skipped: 1 });
  });
});

describe("rate limits and GitHub errors during an automatic run", () => {
  const ghError = (status: number, headers: Record<string, string> = {}) => Object.assign(new Error("github"), { status, response: { headers } });
  const failureOf = (id: number) => prisma.project.findUniqueOrThrow({ where: { id }, select: { lastAutoFailureAt: true, lastAutoFailureCode: true } });

  it("a rate limit thrown by GitHub defers the group: nothing is marked failed, the rest of GitHub is skipped", async () => {
    const a = await group("GITHUB");
    const b = await group("GITHUB");
    const logs: string[] = [];
    const summary = await runAutoAnalysis(new Date(), {
      ...deps(async (id) => { if (id === a.id) throw ghError(403, { "x-ratelimit-remaining": "0" }); return ok; }),
      log: (l) => logs.push(l),
    });
    expect(summary).toMatchObject({ analyzed: 0, failed: 0, skipped: 2, skippedRateLimited: 2 });
    expect(await failureOf(a.id)).toEqual({ lastAutoFailureAt: null, lastAutoFailureCode: null });
    expect(await failureOf(b.id)).toEqual({ lastAutoFailureAt: null, lastAutoFailureCode: null });
    expect(logs.join("\n")).toMatch(/rate limit, will retry on the next run/);
  });

  it("a 403 that is NOT a rate limit (no access to the repository) is a failure with its own code, not a silent wait", async () => {
    const a = await group("GITHUB");
    const b = await group("GITHUB");
    const seen: number[] = [];
    const summary = await runAutoAnalysis(new Date(), deps(async (id) => { seen.push(id); if (id === a.id) throw ghError(403); return ok; }));
    expect(summary).toMatchObject({ analyzed: 1, failed: 1, skippedRateLimited: 0 });
    expect(seen).toEqual([a.id, b.id]);
    expect(await failureOf(a.id)).toMatchObject({ lastAutoFailureCode: "GITHUB_REPO_UNREADABLE" });
  });

  it("without GITHUB_TOKEN the run says so in the log instead of silently missing new commits (no secret is printed)", async () => {
    await group("GITHUB");
    const logs: string[] = [];
    await runAutoAnalysis(new Date(), { change: { latestCommitAt: async () => null, githubToken: undefined }, analyze: async () => ok, log: (l) => logs.push(l) });
    const warning = logs.find((l) => /GITHUB_TOKEN is not set/.test(l));
    expect(warning).toBeTruthy();
    expect(logs.join("\n")).not.toMatch(/ghp_|github_pat_|Bearer/);
  });
});

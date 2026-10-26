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

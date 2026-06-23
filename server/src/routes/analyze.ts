import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { fetchRepoStats } from "../lib/github.js";
import { computeTeamReport } from "@shared/scoring.js";
import { generateFairnessNarrative } from "../lib/gemini.js";
import type { RawMemberStats, AnalyzeResponse, TeamReport } from "@shared/types.js";

export const analyzeRouter = Router();

// ── Shared helper: build RawMemberStats from DB members + GitHub data ─────────

function buildRawMembers(
  members: Array<{ studentName: string; githubUsername: string }>,
  contributors: Awaited<ReturnType<typeof fetchRepoStats>>["contributors"]
): { rawMembers: RawMemberStats[]; unmatchedLogins: string[] } {
  const contributorMap = new Map(
    contributors.map((c) => [c.githubUsername.toLowerCase(), c])
  );
  const matchedLogins = new Set<string>();

  const rawMembers: RawMemberStats[] = members.map((member) => {
    const key = member.githubUsername.toLowerCase();
    const c = contributorMap.get(key);
    if (c) matchedLogins.add(key);
    return {
      studentName:           member.studentName,
      githubUsername:        member.githubUsername,
      commits:               c?.commits               ?? 0,
      additions:             c?.additions             ?? 0,
      deletions:             c?.deletions             ?? 0,
      commitDates:           c?.commitDates           ?? [],
      codeLinesAdded:        c?.codeLinesAdded        ?? 0,
      commentLinesAdded:     c?.commentLinesAdded     ?? 0,
      blankLinesAdded:       c?.blankLinesAdded       ?? 0,
      weightedAdditions:     c?.weightedAdditions     ?? 0,
      selfChurnRatio:        c?.selfChurnRatio        ?? 0,
      commitImpactBreakdown: c?.commitImpactBreakdown ?? { structural: 0, functional: 0, cosmetic: 0, trivial: 0 },
      fileTypeBreakdown:     c?.fileTypeBreakdown     ?? { source: 0, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    };
  });

  const unmatchedLogins = contributors
    .filter((c) => !matchedLogins.has(c.githubUsername.toLowerCase()))
    .map((c) => c.githubUsername);

  return { rawMembers, unmatchedLogins };
}

// ── POST /api/projects/:id/analyze ───────────────────────────────────────────
// Fetches GitHub activity, computes scores, saves/updates the Report row.
// Does NOT call Gemini. Returns any previously saved narrative but never
// generates a new one — use the /narrative endpoint for that.

analyzeRouter.post("/api/projects/:id/analyze", async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: true },
  });
  if (!project) {
    res.status(404).json({ error: `Project ${projectId} not found` });
    return;
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    res.status(500).json({ error: "GITHUB_TOKEN is not set" });
    return;
  }

  let rawData: Awaited<ReturnType<typeof fetchRepoStats>>;
  try {
    rawData = await fetchRepoStats(project.repoUrl, githubToken);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) {
      res.status(404).json({ error: "GitHub repo not found or token lacks access", repoUrl: project.repoUrl });
      return;
    }
    if (e.status === 403 || e.status === 429) {
      res.status(429).json({ error: "GitHub rate limit exceeded" });
      return;
    }
    res.status(502).json({ error: "Failed to fetch GitHub stats", detail: e.message ?? String(err) });
    return;
  }

  const { rawMembers, unmatchedLogins } = buildRawMembers(project.members, rawData.contributors);
  const report = computeTeamReport(rawMembers);

  // Upsert: update existing report row for this project (preserving narrative),
  // or create a fresh one.
  const existing = await prisma.report.findFirst({
    where: { projectId },
    orderBy: { generatedAt: "desc" },
  });

  let savedNarrative: string | null = null;
  if (existing) {
    const stored = existing.content
      ? (JSON.parse(existing.content) as { report?: TeamReport; narrative?: string })
      : {};
    savedNarrative = stored.narrative ?? null;
    await prisma.report.update({
      where: { id: existing.id },
      data: {
        generatedAt: new Date(),
        gini:        report.gini,
        teamHealth:  report.teamHealth,
        content:     JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins }),
      },
    });
  } else {
    await prisma.report.create({
      data: {
        projectId,
        gini:      report.gini,
        teamHealth: report.teamHealth,
        content:   JSON.stringify({ report, narrative: null, unmatchedLogins }),
      },
    });
  }

  const response: AnalyzeResponse = {
    projectId,
    repoUrl:               project.repoUrl,
    analyzedAt:            new Date().toISOString(),
    unmatchedGitHubLogins: unmatchedLogins,
    report,
    narrative:             savedNarrative,
  };

  res.status(200).json(response);
});

// ── POST /api/projects/:id/narrative ─────────────────────────────────────────
// Generates (or returns cached) the AI narrative for the project's latest report.
// Query: ?regenerate=true  — forces a fresh Gemini call even if one is saved.

analyzeRouter.post("/api/projects/:id/narrative", async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const regenerate =
    req.query.regenerate === "true" || (req.body as Record<string, unknown>)?.regenerate === true;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    res.status(404).json({ error: `Project ${projectId} not found` });
    return;
  }

  const latestReport = await prisma.report.findFirst({
    where: { projectId },
    orderBy: { generatedAt: "desc" },
  });
  if (!latestReport) {
    res.status(404).json({ error: "No analysis found — run Analyze first." });
    return;
  }

  const stored = latestReport.content
    ? (JSON.parse(latestReport.content) as { report?: TeamReport; narrative?: string })
    : {};

  // Return cached narrative if present and not regenerating
  if (stored.narrative && !regenerate) {
    res.json({ narrative: stored.narrative, cached: true });
    return;
  }

  if (!stored.report) {
    res.status(500).json({ error: "Stored report data is missing — re-run Analyze." });
    return;
  }

  // Generate via Gemini
  try {
    const narrative = await generateFairnessNarrative(project.name, stored.report);
    await prisma.report.update({
      where: { id: latestReport.id },
      data: { content: JSON.stringify({ ...stored, narrative }) },
    });
    res.json({ narrative, cached: false });
  } catch (err) {
    console.error("[Gemini] narrative generation failed:", err);
    if (stored.narrative) {
      // Degrade gracefully: return saved narrative with a warning
      res.json({
        narrative: stored.narrative,
        cached: true,
        warning: "Generation failed; showing previously saved narrative.",
      });
    } else {
      res.status(503).json({
        error: "AI explanation temporarily unavailable — showing computed results.",
      });
    }
  }
});

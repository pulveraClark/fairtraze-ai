import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { fetchRepoStats } from "../lib/github.js";
import { computeTeamReport } from "@shared/scoring.js";
import { generateFairnessNarrative } from "../lib/gemini.js";
import type { RawMemberStats, AnalyzeResponse } from "@shared/types.js";

export const analyzeRouter = Router();

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
      res.status(404).json({
        error: "GitHub repo not found or token lacks access",
        repoUrl: project.repoUrl,
      });
      return;
    }
    if (e.status === 403 || e.status === 429) {
      res.status(429).json({ error: "GitHub rate limit exceeded" });
      return;
    }
    res.status(502).json({
      error: "Failed to fetch GitHub stats",
      detail: e.message ?? String(err),
    });
    return;
  }

  // Build login → contributor map (case-insensitive)
  const contributorMap = new Map(
    rawData.contributors.map((c) => [c.githubUsername.toLowerCase(), c])
  );

  // Every DB member gets an entry; zero-commit members stay in for scoring
  const matchedLogins = new Set<string>();
  const rawMembers: RawMemberStats[] = project.members.map((member) => {
    const key = member.githubUsername.toLowerCase();
    const contributor = contributorMap.get(key);
    if (contributor) matchedLogins.add(key);
    return {
      studentName: member.studentName,
      githubUsername: member.githubUsername,
      commits: contributor?.commits ?? 0,
      additions: contributor?.additions ?? 0,
      deletions: contributor?.deletions ?? 0,
      commitDates: contributor?.commitDates ?? [],
    };
  });

  const unmatchedGitHubLogins = rawData.contributors
    .filter((c) => !matchedLogins.has(c.githubUsername.toLowerCase()))
    .map((c) => c.githubUsername);

  const report = computeTeamReport(rawMembers);

  // Generate AI narrative (fall back gracefully if key is absent or call fails)
  const geminiKey = process.env.GEMINI_API_KEY;
  let narrative = "AI narrative unavailable — please review the statistics directly.";
  if (geminiKey) {
    try {
      narrative = await generateFairnessNarrative(project.name, report, geminiKey);
    } catch {
      // fallback message already set
    }
  }

  // Persist report to database
  await prisma.report.create({
    data: {
      projectId,
      gini: report.gini,
      teamHealth: report.teamHealth,
      content: JSON.stringify({ report, narrative }),
    },
  });

  const response: AnalyzeResponse = {
    projectId,
    repoUrl: project.repoUrl,
    analyzedAt: new Date().toISOString(),
    unmatchedGitHubLogins,
    report,
    narrative,
  };

  res.status(200).json(response);
});

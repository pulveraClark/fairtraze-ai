import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { fetchRepoStats } from "../lib/github.js";
import type { AnalyzeResponse } from "@shared/types.js";

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

  let rawStats: Awaited<ReturnType<typeof fetchRepoStats>>;
  try {
    rawStats = await fetchRepoStats(project.repoUrl, githubToken);
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

  const memberMap = new Map(
    project.members.map((m) => [m.githubUsername.toLowerCase(), m])
  );
  const unmatchedGitHubLogins: string[] = [];

  const members = rawStats.stats.map((stat) => {
    const member = memberMap.get(stat.githubUsername.toLowerCase());
    if (!member) unmatchedGitHubLogins.push(stat.githubUsername);
    return {
      ...stat,
      studentName: member?.studentName ?? null,
    };
  });

  const response: AnalyzeResponse = {
    projectId,
    repoUrl: project.repoUrl,
    analyzedAt: new Date().toISOString(),
    members,
    unmatchedGitHubLogins,
  };

  res.status(200).json(response);
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import type { TeamHealth, TeamReport, Flag, ProjectSummaryItem, StoredReportResponse } from "@shared/types.js";

export const projectsRouter = Router();

// GET /api/projects — list all projects (used by legacy selector, kept for compat)
projectsRouter.get("/api/projects", async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: { members: true },
    orderBy: { id: "asc" },
  });
  res.json({ projects });
});

// GET /api/projects/summary — dashboard summary from stored reports, no GitHub call
projectsRouter.get("/api/projects/summary", async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: {
      members: true,
      reports: { orderBy: { generatedAt: "desc" }, take: 1 },
    },
    orderBy: { id: "asc" },
  });

  const summary: ProjectSummaryItem[] = projects.map((p) => {
    const latestReport = p.reports[0] ?? null;
    const stored = latestReport?.content
      ? (JSON.parse(latestReport.content) as { report?: TeamReport; narrative?: string })
      : null;
    const report = stored?.report ?? null;

    const memberShares = report?.members.map((m) => ({
      studentName: m.studentName,
      contributionShare: m.contributionShare,
      flags: m.flags,
    })) ?? [];

    const flagsPresent: Flag[] = report
      ? ([...new Set(report.members.flatMap((m) => m.flags))] as Flag[])
      : [];

    return {
      projectId: p.id,
      groupName: p.groupName || `Group ${p.id}`,
      name: p.name,
      assignmentLabel: p.assignmentLabel || "General Assignment",
      memberCount: p.members.length,
      teamHealth: (latestReport?.teamHealth as TeamHealth | null) ?? null,
      gini: latestReport?.gini ?? null,
      memberShares,
      flagsPresent,
      lastAnalyzedAt: latestReport?.generatedAt.toISOString() ?? null,
      isAnalyzed: !!latestReport,
    };
  });

  res.json({ summary });
});

// GET /api/projects/:id/report — fetch a project's latest stored report, no GitHub call
projectsRouter.get("/api/projects/:id/report", async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assignment: { select: { sourceType: true } } },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const latestReport = await prisma.report.findFirst({
    where: { projectId },
    orderBy: { generatedAt: "desc" },
  });
  if (!latestReport) {
    res.status(404).json({ error: "No report found — analyze this project first." });
    return;
  }

  const stored = latestReport.content
    ? (JSON.parse(latestReport.content) as {
        report?: TeamReport;
        narrative?: string;
        unmatchedLogins?: string[];
      })
    : {};

  if (!stored.report) {
    res.status(500).json({ error: "Report data is missing — re-run Analyze." });
    return;
  }

  const response: StoredReportResponse = {
    projectId,
    groupName: project.groupName || `Group ${projectId}`,
    name: project.name,
    repoUrl: project.repoUrl,
    analyzedAt: latestReport.generatedAt.toISOString(),
    report: stored.report,
    narrative: stored.narrative ?? null,
    unmatchedGitHubLogins: stored.unmatchedLogins ?? [],
    sourceType: project.assignment?.sourceType ?? null,
  };

  res.json(response);
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import type { TeamHealth, TeamReport, Flag, ProjectSummaryItem, StoredReportResponse, ProjectScoringConfig, MemberRoleInfo, FunctionalRole } from "@shared/types.js";

export const projectsRouter = Router();

// Helper: build a ProjectScoringConfig from project row fields
function projectConfig(p: {
  weightCommits: number;
  weightLines: number;
  weightActiveDays: number;
  freeRiderThreshold: number;
  overloadThreshold: number;
  deadlineDrivenThreshold: number;
}): ProjectScoringConfig {
  return {
    weights: {
      commits:    p.weightCommits,
      lines:      p.weightLines,
      activeDays: p.weightActiveDays,
    },
    thresholds: {
      freeRider:      p.freeRiderThreshold,
      overload:       p.overloadThreshold,
      deadlineDriven: p.deadlineDrivenThreshold,
    },
  };
}

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
      assignment: { select: { id: true, classSectionId: true } },
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
      projectId:    p.id,
      groupName:    p.groupName || `Group ${p.id}`,
      name:         p.name,
      assignmentLabel: p.assignmentLabel || "General Assignment",
      classId:      p.assignment?.classSectionId ?? null,
      assignmentId: p.assignment?.id ?? null,
      memberCount:  p.members.length,
      teamHealth:   (latestReport?.teamHealth as TeamHealth | null) ?? null,
      gini:         latestReport?.gini ?? null,
      memberShares,
      flagsPresent,
      lastAnalyzedAt:         latestReport?.generatedAt.toISOString() ?? null,
      isAnalyzed:             !!latestReport,
      membershipChangedAt:    p.membershipChangedAt?.toISOString() ?? null,
      scoringConfigChangedAt: p.scoringConfigChangedAt?.toISOString() ?? null,
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
    include: {
      assignment: { select: { sourceType: true } },
      groupMemberships: {
        include: { user: { select: { id: true, githubUsername: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
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
        scoringConfig?: ProjectScoringConfig;
      })
    : {};

  if (!stored.report) {
    res.status(500).json({ error: "Report data is missing — re-run Analyze." });
    return;
  }

  const currentCfg = projectConfig(project);

  // Build memberRoles — context-only; never affects scores, flags, Gini, or team health.
  // Mismatch note: Developer assigned but member has 0 commits in the stored report.
  const reportMembers = stored.report.members;
  const memberRoles: MemberRoleInfo[] = project.groupMemberships.map((m) => {
    const functionalRoles = JSON.parse(m.functionalRoles) as FunctionalRole[];
    const isLeader = m.role === "LEADER";
    const github   = m.user.githubUsername ?? null;

    // Find the member's stats in the stored report by githubUsername
    const scored = github
      ? reportMembers.find((rm) => rm.githubUsername.toLowerCase() === github.toLowerCase())
      : null;

    let mismatchNote: string | null = null;
    if (functionalRoles.includes("DEVELOPER")) {
      if (!scored || scored.commits === 0) {
        mismatchNote = "Developer — no recorded GitHub activity";
      }
    }
    // DOCUMENTATION mismatch detection is deferred to Phase D (editor data source not yet built)

    return { githubUsername: github ?? "", functionalRoles, isLeader, mismatchNote };
  });

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
    scoringConfig:          stored.scoringConfig ?? null,
    currentConfig:          currentCfg,
    scoringConfigChangedAt: project.scoringConfigChangedAt?.toISOString() ?? null,
    memberRoles,
  };

  res.json(response);
});

// PATCH /api/projects/:id/config — update per-project scoring weights and thresholds
// requireRole(INSTRUCTOR) + ownership check through assignment chain
projectsRouter.patch("/api/projects/:id/config", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const bodySchema = z.object({
    weights: z.object({
      commits:    z.number().min(0).max(1),
      lines:      z.number().min(0).max(1),
      activeDays: z.number().min(0).max(1),
    }),
    thresholds: z.object({
      freeRider:      z.number().min(0).max(1),
      overload:       z.number().min(1),
      deadlineDriven: z.number().min(0).max(1),
    }),
  });

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid config", details: parsed.error.flatten() });
    return;
  }

  const { weights, thresholds } = parsed.data;

  // Validate weights sum to 1.0 (tolerance ±0.001 for floating-point rounding)
  const weightSum = weights.commits + weights.lines + weights.activeDays;
  if (Math.abs(weightSum - 1.0) > 0.001) {
    res.status(400).json({
      error: `Weights must sum to 1.0 (got ${weightSum.toFixed(3)}). Adjust the three values so they add up to exactly 1.`,
    });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assignment: { include: { classSection: true } } },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Ownership: if the project belongs to an assignment, the instructor must own that class
  if (project.assignment) {
    if (project.assignment.classSection.instructorId !== req.user!.sub) {
      res.status(403).json({ error: "You do not have access to this project" });
      return;
    }
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      weightCommits:           weights.commits,
      weightLines:             weights.lines,
      weightActiveDays:        weights.activeDays,
      freeRiderThreshold:      thresholds.freeRider,
      overloadThreshold:       thresholds.overload,
      deadlineDrivenThreshold: thresholds.deadlineDriven,
      scoringConfigChangedAt:  new Date(),
    },
  });

  const config: ProjectScoringConfig = projectConfig(updated);
  res.json({ config });
});

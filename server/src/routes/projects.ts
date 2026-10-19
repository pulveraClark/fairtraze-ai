import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { docsDataApproximateFor, getAuthorshipFixAt } from "../lib/authorshipFix.js";
import { requireRole } from "../middleware/auth.js";
import { ASSIGNMENT_CONFIG_SELECT, assignmentScoringConfig, configsEqual, scoringConfigBodySchema, validateConfigSums, saveAssignmentScoringConfig } from "../lib/scoringConfig.js";
import type { TeamHealth, TeamReport, Flag, ProjectSummaryItem, StoredReportResponse, ProjectScoringConfig, MemberRoleInfo, FunctionalRole, AnyScoredMember } from "@shared/types.js";

export const projectsRouter = Router();

// Mismatch-note helpers: AnyScoredMember is a union of ScoredMember (flat `commits`),
// DocumentScoredMember (flat `sessionCount`), and CombinedScoredMember (no flat commits/
// sessionCount — nested under `.github`/`.document`). The "github"/"document" checks are safe
// discriminators since only CombinedScoredMember has those keys.
export function githubCommitsOf(m: AnyScoredMember | undefined | null): number | undefined {
  if (!m) return undefined;
  if ("github" in m) return m.github?.commits;
  if ("commits" in m) return m.commits;
  return undefined;
}

export function editorSessionCountOf(m: AnyScoredMember | undefined | null): number | undefined {
  if (!m) return undefined;
  if ("document" in m) return m.document?.sessionCount;
  if ("sessionCount" in m) return m.sessionCount;
  return undefined;
}

// Accumulates independently — a member holding both DEVELOPER and DOCUMENTATION who
// mismatches on both gets both notes, neither overwrites the other.
export function buildMismatchNotes(
  functionalRoles: FunctionalRole[],
  githubMember: AnyScoredMember | undefined | null,
  docMember: AnyScoredMember | undefined | null,
): string[] {
  const notes: string[] = [];
  if (functionalRoles.includes("DEVELOPER")) {
    const commits = githubCommitsOf(githubMember);
    if (commits === undefined || commits === 0) {
      notes.push("Developer — no recorded GitHub activity");
    }
  }
  if (functionalRoles.includes("DOCUMENTATION")) {
    const sessionCount = editorSessionCountOf(docMember);
    if (sessionCount === undefined || sessionCount === 0) {
      notes.push("Documentation — no recorded editor activity");
    }
  }
  return notes;
}

// Purely informational — see MemberRoleInfo.taskSummary. Never read by
// shared/src/scoring.ts and never folded into contributionShare/flags/Gini.
export function buildTaskSummary(
  tasks: { assignedToUserId: number | null; done: boolean }[],
  userId: number,
): { completed: number; total: number } {
  const assigned = tasks.filter((t) => t.assignedToUserId === userId);
  return { completed: assigned.filter((t) => t.done).length, total: assigned.length };
}

// GET /api/projects — list all projects (used by legacy selector, kept for compat)
// requireRole(INSTRUCTOR) + scoped to the requesting instructor's own projects.
// TODO: assignment-less projects (assignmentId: null) are accessible to any
// authenticated instructor by design for now — known gap, not fixed here.
projectsRouter.get("/api/projects", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { assignmentId: null },
        { assignment: { classSection: { instructorId: req.user!.sub } } },
      ],
    },
    include: { members: true },
    orderBy: { id: "asc" },
  });
  res.json({ projects });
});

// GET /api/projects/summary — dashboard summary from stored reports, no GitHub call
// requireRole(INSTRUCTOR) + scoped to the requesting instructor's own projects.
// TODO: assignment-less projects (assignmentId: null) are accessible to any
// authenticated instructor by design for now — known gap, not fixed here.
projectsRouter.get("/api/projects/summary", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { assignmentId: null },
        { assignment: { classSection: { instructorId: req.user!.sub } } },
      ],
    },
    include: {
      members: true,
      reports: { orderBy: { generatedAt: "desc" }, take: 1 },
      assignment: { select: { id: true, title: true, classSectionId: true, classSection: { select: { subjectCode: true, subjectName: true } }, sourceType: true, ...ASSIGNMENT_CONFIG_SELECT } },
    },
    orderBy: { id: "asc" },
  });

  const summary: ProjectSummaryItem[] = projects.map((p) => {
    const latestReport = p.reports[0] ?? null;
    const stored = latestReport?.content
      ? (JSON.parse(latestReport.content) as { report?: TeamReport; narrative?: string; scoringConfig?: ProjectScoringConfig | null })
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

    // Outdated = the stored snapshot differs from the project's current settings. Reports without a
    // snapshot (EDITOR, legacy) can't be compared and never show as outdated. blend only matters for COMBINED.
    const settingsOutdated = !!(stored?.scoringConfig && p.assignment
      && !configsEqual(stored.scoringConfig, assignmentScoringConfig(p.assignment), p.assignment.sourceType === "COMBINED"));

    return {
      projectId:    p.id,
      groupName:    p.groupName || `Group ${p.id}`,
      assignmentLabel: p.assignmentLabel || "General Assignment",
      classId:      p.assignment?.classSectionId ?? null,
      assignmentId: p.assignment?.id ?? null,
      classCode:        p.assignment?.classSection?.subjectCode ?? undefined,
      classSubjectName: p.assignment?.classSection?.subjectName ?? undefined,
      assignmentTitle:  p.assignment?.title ?? undefined,
      sourceType:   p.assignment?.sourceType ?? null,
      memberCount:  p.members.length,
      teamHealth:   (latestReport?.teamHealth as TeamHealth | null) ?? null,
      gini:         latestReport?.gini ?? null,
      memberShares,
      flagsPresent,
      lastAnalyzedAt:         latestReport?.generatedAt.toISOString() ?? null,
      isAnalyzed:             !!latestReport,
      membershipChangedAt:    p.membershipChangedAt?.toISOString() ?? null,
      scoringConfigChangedAt: p.scoringConfigChangedAt?.toISOString() ?? null,
      settingsOutdated,
    };
  });

  res.json({ summary });
});

// GET /api/projects/:id/report/history — Gini/team-health across all stored analysis runs
// requireRole(INSTRUCTOR) + ownership check through assignment chain (same pattern as /report)
projectsRouter.get("/api/projects/:id/report/history", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignment: { select: { classSection: { select: { instructorId: true } } } },
    },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.assignment) {
    if (project.assignment.classSection.instructorId !== req.user!.sub) {
      res.status(403).json({ error: "You do not have access to this project" });
      return;
    }
  }

  const reports = await prisma.report.findMany({
    where:  { projectId },
    select: { generatedAt: true, gini: true, teamHealth: true },
    orderBy: { generatedAt: "asc" },
  });

  res.json({
    history: reports.map((r) => ({
      generatedAt: r.generatedAt.toISOString(),
      gini:        r.gini,
      teamHealth:  r.teamHealth as TeamHealth | null,
    })),
  });
});

// GET /api/projects/:id/report — fetch a project's latest stored report, no GitHub call
// requireRole(INSTRUCTOR) + ownership check through assignment chain
projectsRouter.get("/api/projects/:id/report", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignment: { select: { id: true, sourceType: true, ...ASSIGNMENT_CONFIG_SELECT, classSection: { select: { instructorId: true } } } },
      groupMemberships: {
        include: { user: { select: { id: true, githubUsername: true, avatarUpdatedAt: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Ownership: if the project belongs to an assignment, the instructor must own that class
  // TODO: assignment-less projects (assignmentId: null) are accessible to any
  // authenticated instructor by design for now — known gap, not fixed here.
  if (project.assignment) {
    if (project.assignment.classSection.instructorId !== req.user!.sub) {
      res.status(403).json({ error: "You do not have access to this project" });
      return;
    }
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
        report?: TeamReport<AnyScoredMember>;
        narrative?: string;
        unmatchedLogins?: string[];
        scoringConfig?: ProjectScoringConfig;
      })
    : {};

  if (!stored.report) {
    res.status(500).json({ error: "Report data is missing — re-run Analyze." });
    return;
  }

  const currentCfg = assignmentScoringConfig(project.assignment);

  // Build memberRoles — context-only; never affects scores, flags, Gini, or team health.
  // Mismatch note: Developer assigned but member has 0 commits in the stored report.
  const reportMembers = stored.report.members;
  const tasks = await prisma.task.findMany({
    where:  { projectId },
    select: { assignedToUserId: true, done: true },
  });
  const memberRoles: MemberRoleInfo[] = project.groupMemberships.map((m) => {
    const functionalRoles = JSON.parse(m.functionalRoles) as FunctionalRole[];
    const isLeader = m.role === "LEADER";
    const github   = m.user.githubUsername ?? null;

    // Find the member's stats in the stored report by githubUsername
    const scored = github
      ? reportMembers.find((rm) => rm.githubUsername.toLowerCase() === github.toLowerCase())
      : null;

    const docActivity = reportMembers.find((rm) => "userId" in rm && rm.userId === m.user.id);
    const mismatchNotes = buildMismatchNotes(functionalRoles, scored, docActivity);
    const taskSummary = buildTaskSummary(tasks, m.user.id);

    return { userId: m.user.id, githubUsername: github ?? "", functionalRoles, isLeader, mismatchNotes, taskSummary, avatarUpdatedAt: m.user.avatarUpdatedAt ? m.user.avatarUpdatedAt.toISOString() : null };
  });

  const response: StoredReportResponse = {
    projectId,
    assignmentId: project.assignment?.id ?? null,
    groupName: project.groupName || `Group ${projectId}`,
    repoUrl: project.repoUrl,
    analyzedAt: latestReport.generatedAt.toISOString(),
    report: stored.report,
    narrative: stored.narrative ?? null,
    unmatchedGitHubLogins: stored.unmatchedLogins ?? [],
    sourceType: project.assignment?.sourceType ?? null,
    scoringConfig:          stored.scoringConfig ?? null,
    currentConfig:          currentCfg,
    scoringConfigChangedAt: project.scoringConfigChangedAt?.toISOString() ?? null,
    membershipChangedAt:    project.membershipChangedAt?.toISOString() ?? null,
    memberRoles,
    docsDataApproximate: await docsDataApproximateFor(projectId, project.assignment?.sourceType),
    docsDataFixedAt: getAuthorshipFixAt().toISOString(),
  };

  res.json(response);
});

// PATCH /api/projects/:id/config — legacy alias. Scoring settings are per project (Assignment), so this
// resolves the group's assignment and writes there (owning instructor only; applies to every group in it).
projectsRouter.patch("/api/projects/:id/config", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const parsed = scoringConfigBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid config", details: parsed.error.flatten() });
    return;
  }
  const sumError = validateConfigSums(parsed.data);
  if (sumError) {
    res.status(400).json({ error: sumError });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: idResult.data },
    include: { assignment: { include: { classSection: true } } },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  // Assignment-less groups have no project-level settings to edit.
  if (!project.assignment) {
    res.status(400).json({ error: "This group is not part of a project, so it has no scoring settings." });
    return;
  }
  if (project.assignment.classSection.instructorId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this project" });
    return;
  }

  const config = await saveAssignmentScoringConfig(prisma, project.assignment, parsed.data);
  res.json({ config });
});

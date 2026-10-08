import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { fetchRepoStats, type GitHubProgress } from "../lib/github.js";
import { computeTeamReport } from "@shared/scoring.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { computeCombinedTeamReport } from "@shared/combinedScoring.js";
import { computeDocumentRawStats } from "../collab/editStats.js";
import { generateFairnessNarrative } from "../lib/gemini.js";
import { generateAlertsForProject } from "../lib/alerts.js";
import { notify } from "../lib/notify.js";
import { countByDay } from "../lib/dayCounts.js";
import type { Request, Response } from "express";
import type { RawMemberStats, RawDocumentMemberStats, AnalyzeResponse, TeamReport, AnyScoredMember, ProjectScoringConfig, DocumentScoredMember } from "@shared/types.js";

export const analyzeRouter = Router();

// ── Optional progress stream (SSE) ────────────────────────────────────────────
// A client that sends `Accept: text/event-stream` (or ?stream=1) gets stage events while the
// analysis runs, then a final `done` event carrying the same AnalyzeResponse the plain JSON path
// returns. Every other client gets exactly the previous single JSON response: finish() falls
// through to res.status(...).json(...) and emit() is a no-op.
//
// Event payloads are built from literal fields only (counts, display names, YYYY-MM-DD day
// buckets) — never spread from a report or member object — so no score, flag, Gini or
// team-health value can appear before `done`.
//
// If compression() middleware is ever added to app.ts, it must skip text/event-stream responses
// (the no-transform header below only stops well-behaved intermediaries).
interface ProgressEmitter {
  readonly stream: boolean;
  readonly opened: boolean;
  open(): void;
  emit(event: "github" | "docs" | "compute" | "save", data: object): void;
  finish(status: number, body: object): void;
}

const KEEP_ALIVE_MS = 10_000;

function createProgressEmitter(req: Request, res: Response): ProgressEmitter {
  const stream = (req.headers.accept ?? "").includes("text/event-stream") || req.query.stream === "1";
  let opened = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const write = (chunk: string) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(chunk);
    (res as Response & { flush?: () => void }).flush?.();
  };
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };

  return {
    stream,
    get opened() { return opened; },
    open() {
      if (!stream || opened) return;
      opened = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      timer = setInterval(() => write(": keep-alive\n\n"), KEEP_ALIVE_MS);
      timer.unref();
      res.on("close", stop);
    },
    emit(event, data) {
      if (!opened) return;
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    finish(status, body) {
      if (!stream) {
        res.status(status).json(body);
        return;
      }
      this.open();
      if (status === 200) write(`event: done\ndata: ${JSON.stringify(body)}\n\n`);
      else write(`event: error\ndata: ${JSON.stringify({ status, ...body })}\n\n`);
      stop();
      if (!res.writableEnded) res.end();
    },
  };
}

// Matched member display name, else the GitHub login. Case-insensitive, like buildRawMembers.
function githubNameResolver(members: Array<{ studentName: string; githubUsername: string }>): (login: string) => string {
  const byLogin = new Map(members.map((m) => [m.githubUsername.toLowerCase(), m.studentName]));
  return (login) => byLogin.get(login.toLowerCase()) ?? login;
}

// One github event per finished contributor: cumulative counts, that contributor's raw commit
// count, and their per-day commit counts (Asia/Manila days). Counts and dates only.
function emitGithubProgress(progress: ProgressEmitter, p: GitHubProgress, resolveName: (login: string) => string): void {
  const data: Record<string, unknown> = { contributors: p.contributors, commits: p.commits, files: p.files };
  if (p.member) {
    data.member = { name: resolveName(p.member.login), commits: p.member.commits };
    data.days = countByDay(p.member.commitDates);
  }
  progress.emit("github", data);
}

// Roster members the GitHub fetch never returned (no commits) are announced with a zero count, so
// they appear in the list. Emitted after collection and before `compute`.
function emitZeroCommitMembers(
  progress: ProgressEmitter,
  rawMembers: RawMemberStats[],
  contributors: Array<{ githubUsername: string; commits: number; filesChanged?: number }>
): void {
  const seen = new Set(contributors.map((c) => c.githubUsername.toLowerCase()));
  const totals = {
    contributors: contributors.length,
    commits:      contributors.reduce((s, c) => s + c.commits, 0),
    files:        contributors.reduce((s, c) => s + (c.filesChanged ?? 0), 0),
  };
  for (const m of rawMembers) {
    if (seen.has(m.githubUsername.toLowerCase())) continue;
    progress.emit("github", { ...totals, member: { name: m.studentName, commits: 0 }, days: [] });
  }
}

// One docs event per roster member, from the already-computed raw doc stats
// (computeDocumentRawStats is untouched): running totals, that member's raw session and
// character counts, and their per-day session counts (Asia/Manila days).
function emitDocsProgress(progress: ProgressEmitter, raw: RawDocumentMemberStats[]): void {
  let sessions = 0;
  let characters = 0;
  for (const m of raw) {
    sessions += m.sessionCount;
    characters += m.totalInsertedChars;
    progress.emit("docs", {
      sessions,
      characters,
      member: { name: m.studentName, sessions: m.sessionCount, characters: m.totalInsertedChars },
      days:   countByDay(m.sessionDates),
    });
  }
}

// Tells each group member a fresh report is available. Students see the latest report as soon
// as it is stored (GET /api/student/group/:projectId has no release gate), so this fires right
// after the Report row is written. The message deliberately carries no scores or health label.
// collapse: re-analysing refreshes one unread row per member instead of stacking.
async function notifyReportReady(
  project: { id: number; groupName: string; groupMemberships: { userId: number }[] }
): Promise<void> {
  await notify({
    recipientIds: project.groupMemberships.map((m) => m.userId),
    type:         "REPORT_READY",
    message:      `A new contribution report is available for ${project.groupName.trim() || `Group ${project.id}`}`,
    link:         `/student/group/${project.id}`,
    projectId:    project.id,
    collapse:     true,
  });
}

// Persists one DocumentContribution row per member, alongside the existing Report.content JSON
// blob — see CLAUDE.md/manuscript Table 61. Shared between the EDITOR and COMBINED branches
// below since both compute a DocumentScoredMember[] the same way.
async function writeDocumentContributionRows(
  documentId: number,
  reportId: number,
  members: DocumentScoredMember[]
): Promise<void> {
  if (members.length === 0) return;
  await prisma.documentContribution.createMany({
    data: members.map((m) => ({
      documentId,
      userId:                    m.userId,
      reportId,
      netRetainedChars:          m.retainedChars,
      weightedRetainedChars:     m.weightedRetainedChars,
      effectiveRetainedChars:    m.effectiveRetainedChars,
      totalCharsInserted:        m.totalInsertedChars,
      totalCharsDeleted:         m.totalDeletedChars,
      selfChurnRatio:            m.selfChurnRatio,
      editSessionCount:          m.sessionCount,
      activeEditingDays:         m.activeDays,
      lastPhaseRatio:            m.lastPhaseRatio,
      retainedTextShare:         m.retainedTextShare,
      sessionShare:              m.sessionShare,
      activeDaysShare:           m.activeDaysShare,
      documentContributionShare: m.contributionShare,
    })),
  });
}

// Copies the document's already-current, already-debounce-persisted yjsState column into a new
// DocumentSnapshot row — a point-in-time revision-history entry anchored to this analysis run's
// Report. This is a plain Prisma read + insert: it never calls getYDoc(), never touches the live
// Y.Doc, and registers no Yjs update listener, so it has zero interaction with
// server/src/collab/authorshipCapture.ts or the live collab room.
async function writeDocumentSnapshot(documentId: number, reportId: number): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { yjsState: true } });
  if (!doc?.yjsState) return;
  await prisma.documentSnapshot.create({
    data: { documentId, reportId, yjsState: doc.yjsState },
  });
}

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

analyzeRouter.post("/api/projects/:id/analyze", ...requireRole("INSTRUCTOR"), requireVerifiedEmail, async (req, res) => {
  const progress = createProgressEmitter(req, res);
  try {
    await runAnalyze(req, res, progress);
  } catch (err) {
    // Plain JSON clients: rethrow so Express's error handler responds exactly as before.
    // Once the stream is open, headers are already sent, so report the failure as an event.
    if (!progress.opened) throw err;
    console.error(err);
    progress.finish(500, { error: err instanceof Error ? err.message : "Internal server error" });
  }
});

async function runAnalyze(req: Request, res: Response, progress: ProgressEmitter): Promise<void> {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: true,
      assignment: { select: { sourceType: true, deadline: true, classSection: { select: { instructorId: true } } } },
      document: { select: { id: true } },
      groupMemberships: { include: { user: { select: { id: true, name: true, githubUsername: true } } } },
    },
  });
  if (!project) {
    res.status(404).json({ error: `Project ${projectId} not found` });
    return;
  }

  // Ownership: if the project belongs to an assignment, the instructor must own that class
  if (project.assignment) {
    if (project.assignment.classSection.instructorId !== req.user!.sub) {
      res.status(403).json({ error: "You do not have access to this project" });
      return;
    }
  }

  const sourceType = project.assignment?.sourceType ?? null;
  const deadlineMs = project.assignment?.deadline ? project.assignment.deadline.getTime() : null;

  // Validation/ownership errors above stay plain JSON; from here on a streaming client
  // gets stage events and a terminal done/error event.
  progress.open();

  if (sourceType === "EDITOR") {
    const roster = project.groupMemberships.map((m) => ({
      userId: m.user.id,
      studentName: m.user.name,
      githubUsername: m.user.githubUsername ?? "",
    }));
    const rawMembers = await computeDocumentRawStats(project.document?.id ?? null, roster);
    emitDocsProgress(progress, rawMembers);
    progress.emit("compute", {});
    const report = computeDocumentTeamReport(rawMembers, undefined, undefined, deadlineMs);

    const existing = await prisma.report.findFirst({ where: { projectId }, orderBy: { generatedAt: "desc" } });
    const stored = existing?.content ? (JSON.parse(existing.content) as { narrative?: string }) : {};
    const savedNarrative = stored.narrative ?? null;
    progress.emit("save", {});
    const createdReport = await prisma.report.create({
      data: {
        projectId,
        gini:      report.gini,
        teamHealth: report.teamHealth,
        content:   JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins: [], scoringConfig: null }),
      },
    });

    if (project.document?.id) {
      await writeDocumentContributionRows(project.document.id, createdReport.id, report.members);
      await writeDocumentSnapshot(project.document.id, createdReport.id);
    }

    await prisma.project.update({
      where: { id: projectId },
      data:  { membershipChangedAt: null, scoringConfigChangedAt: null },
    });

    await notifyReportReady(project);

    generateAlertsForProject(projectId, report, {
      groupName:      project.groupName,
      assignmentLabel: project.assignmentLabel,
      assignmentId:   project.assignmentId,
    }).catch((err) => console.error("[alerts] generation failed:", err));

    const response: AnalyzeResponse = {
      projectId,
      repoUrl:               project.repoUrl,
      analyzedAt:            new Date().toISOString(),
      unmatchedGitHubLogins: [],
      report,
      narrative:             savedNarrative,
    };
    progress.finish(200, response);
    return;
  }

  if (sourceType === "COMBINED") {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      progress.finish(500, { error: "GITHUB_TOKEN is not set" });
      return;
    }

    const requiredLogins = project.members.map((m) => m.githubUsername);
    const roster = project.groupMemberships.map((m) => ({
      userId:         m.user.id,
      studentName:    m.user.name,
      githubUsername: m.user.githubUsername ?? "",
    }));

    // GitHub and editor collection read disjoint inputs (GitHub API + CachedCommitDiff vs.
    // EditEvent/EditSession) and both results feed the same scoring calls unchanged, so running
    // them concurrently changes no scoring input. allSettled (not all) keeps today's error
    // precedence: a GitHub failure is reported with the same mapped status/body as before even if
    // the docs read also failed, and a docs-only failure propagates exactly as it did sequentially.
    const resolveName = githubNameResolver(project.members);
    progress.emit("github", { contributors: 0, commits: 0, files: 0 });
    const [githubResult, docsResult] = await Promise.allSettled([
      fetchRepoStats(project.repoUrl, githubToken, requiredLogins, (p) => emitGithubProgress(progress, p, resolveName)),
      computeDocumentRawStats(project.document?.id ?? null, roster).then((raw) => {
        emitDocsProgress(progress, raw);
        return raw;
      }),
    ]);

    if (githubResult.status === "rejected") {
      const err = githubResult.reason;
      const e = err as { status?: number; message?: string };
      if (e.status === 404) {
        progress.finish(404, { error: "GitHub repo not found or token lacks access", repoUrl: project.repoUrl });
        return;
      }
      if (e.status === 403 || e.status === 429) {
        progress.finish(429, { error: "GitHub rate limit exceeded" });
        return;
      }
      progress.finish(502, { error: "Failed to fetch GitHub stats", detail: e.message ?? String(err) });
      return;
    }
    if (docsResult.status === "rejected") throw docsResult.reason;

    const rawData = githubResult.value;
    const documentRaw = docsResult.value;

    const { rawMembers: githubRaw, unmatchedLogins } = buildRawMembers(project.members, rawData.contributors);

    const scoringConfig: ProjectScoringConfig = {
      weights: {
        commits:    project.weightCommits,
        lines:      project.weightLines,
        activeDays: project.weightActiveDays,
      },
      thresholds: {
        freeRider:      project.freeRiderThreshold,
        overload:       project.overloadThreshold,
        deadlineDriven: project.deadlineDrivenThreshold,
      },
      blend: {
        wGitHub: project.weightGithub,
        wDocs:   project.weightDocs,
      },
    };

    emitZeroCommitMembers(progress, githubRaw, rawData.contributors);
    progress.emit("compute", {});
    const githubReport = computeTeamReport(githubRaw, scoringConfig.weights, scoringConfig.thresholds, deadlineMs);

    const documentReport = computeDocumentTeamReport(documentRaw, undefined, undefined, deadlineMs);

    const report = computeCombinedTeamReport(
      roster, githubRaw, githubReport.members, documentRaw, documentReport.members,
      scoringConfig.blend!, scoringConfig.thresholds, deadlineMs
    );

    const existing = await prisma.report.findFirst({ where: { projectId }, orderBy: { generatedAt: "desc" } });
    const stored = existing?.content ? (JSON.parse(existing.content) as { narrative?: string }) : {};
    const savedNarrative = stored.narrative ?? null;
    progress.emit("save", {});
    const createdReport = await prisma.report.create({
      data: {
        projectId,
        gini:      report.gini,
        teamHealth: report.teamHealth,
        content:   JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins, scoringConfig }),
      },
    });

    if (project.document?.id) {
      await writeDocumentContributionRows(project.document.id, createdReport.id, documentReport.members);
      await writeDocumentSnapshot(project.document.id, createdReport.id);
    }
    await prisma.combinedContribution.createMany({
      data: report.members.map((m) => ({
        reportId:                  createdReport.id,
        userId:                    m.userId,
        githubContributionShare:   m.githubContributionShare,
        documentContributionShare: m.documentContributionShare,
        wGitHub:                   m.wGitHub,
        wDocs:                     m.wDocs,
        combinedContributionShare: m.contributionShare,
        flags:                     JSON.stringify(m.flags),
        mismatchNotes:             null,
      })),
    });

    await prisma.project.update({
      where: { id: projectId },
      data:  { membershipChangedAt: null, scoringConfigChangedAt: null },
    });

    await notifyReportReady(project);

    generateAlertsForProject(projectId, report, {
      groupName:      project.groupName,
      assignmentLabel: project.assignmentLabel,
      assignmentId:   project.assignmentId,
    }).catch((err) => console.error("[alerts] generation failed:", err));

    const response: AnalyzeResponse = {
      projectId,
      repoUrl:               project.repoUrl,
      analyzedAt:            new Date().toISOString(),
      unmatchedGitHubLogins: unmatchedLogins,
      report,
      narrative:             savedNarrative,
    };
    progress.finish(200, response);
    return;
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    progress.finish(500, { error: "GITHUB_TOKEN is not set" });
    return;
  }

  const requiredLogins = project.members.map((m) => m.githubUsername);
  console.log(`[analyze] project ${projectId}: ${requiredLogins.length} DB member(s): ${requiredLogins.join(", ")}`);

  const resolveName = githubNameResolver(project.members);
  let rawData: Awaited<ReturnType<typeof fetchRepoStats>>;
  try {
    progress.emit("github", { contributors: 0, commits: 0, files: 0 });
    rawData = await fetchRepoStats(project.repoUrl, githubToken, requiredLogins, (p) => emitGithubProgress(progress, p, resolveName));
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) {
      progress.finish(404, { error: "GitHub repo not found or token lacks access", repoUrl: project.repoUrl });
      return;
    }
    if (e.status === 403 || e.status === 429) {
      progress.finish(429, { error: "GitHub rate limit exceeded" });
      return;
    }
    progress.finish(502, { error: "Failed to fetch GitHub stats", detail: e.message ?? String(err) });
    return;
  }

  console.log(`[analyze] project ${projectId}: GitHub returned ${rawData.contributors.length} contributor(s): ${rawData.contributors.map((c) => c.githubUsername).join(", ")}`);

  const { rawMembers, unmatchedLogins } = buildRawMembers(project.members, rawData.contributors);
  console.log(`[analyze] project ${projectId}: rawMembers built: ${rawMembers.length} — ${rawMembers.map((m) => `${m.githubUsername}(${m.commits})`).join(", ")}`);

  // Build scoring config from stored project settings
  const scoringConfig: ProjectScoringConfig = {
    weights: {
      commits:    project.weightCommits,
      lines:      project.weightLines,
      activeDays: project.weightActiveDays,
    },
    thresholds: {
      freeRider:      project.freeRiderThreshold,
      overload:       project.overloadThreshold,
      deadlineDriven: project.deadlineDrivenThreshold,
    },
  };

  emitZeroCommitMembers(progress, rawMembers, rawData.contributors);
  progress.emit("compute", {});
  const report = computeTeamReport(rawMembers, scoringConfig.weights, scoringConfig.thresholds, deadlineMs);
  console.log(`[analyze] project ${projectId}: report has ${report.memberCount} member(s)`);

  // Always create a new Report row per analysis run — history accumulates so the
  // instructor can see how Gini/team health changed across the project lifecycle
  // (see GET /api/projects/:id/report/history). Only the previous row's narrative
  // is carried forward, so re-analyzing doesn't silently blank a saved AI explanation.
  const existing = await prisma.report.findFirst({
    where: { projectId },
    orderBy: { generatedAt: "desc" },
  });

  const stored = existing?.content
    ? (JSON.parse(existing.content) as { report?: TeamReport; narrative?: string })
    : {};
  const savedNarrative = stored.narrative ?? null;
  progress.emit("save", {});
  await prisma.report.create({
    data: {
      projectId,
      gini:      report.gini,
      teamHealth: report.teamHealth,
      content:   JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins, scoringConfig }),
    },
  });

  // Clear stale flags — report now reflects current membership and scoring config
  await prisma.project.update({
    where: { id: projectId },
    data:  { membershipChangedAt: null, scoringConfigChangedAt: null },
  });

  // Fire-and-forget: generate alerts for at-risk groups. Never blocks the response.
  await notifyReportReady(project);

  generateAlertsForProject(projectId, report, {
    groupName:      project.groupName,
    assignmentLabel: project.assignmentLabel,
    assignmentId:   project.assignmentId,
  }).catch((err) => console.error("[alerts] generation failed:", err));

  const response: AnalyzeResponse = {
    projectId,
    repoUrl:               project.repoUrl,
    analyzedAt:            new Date().toISOString(),
    unmatchedGitHubLogins: unmatchedLogins,
    report,
    narrative:             savedNarrative,
  };

  progress.finish(200, response);
}

// ── POST /api/projects/:id/narrative ─────────────────────────────────────────
// Generates (or returns cached) the AI narrative for the project's latest report.
// Query: ?regenerate=true  — forces a fresh Gemini call even if one is saved.

analyzeRouter.post("/api/projects/:id/narrative", ...requireRole("INSTRUCTOR"), requireVerifiedEmail, async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const regenerate =
    req.query.regenerate === "true" || (req.body as Record<string, unknown>)?.regenerate === true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assignment: { select: { classSection: { select: { instructorId: true } } } } },
  });
  if (!project) {
    res.status(404).json({ error: `Project ${projectId} not found` });
    return;
  }

  // Ownership: if the project belongs to an assignment, the instructor must own that class
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
    const narrative = await generateFairnessNarrative(project.groupName || `Group ${projectId}`, stored.report);
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

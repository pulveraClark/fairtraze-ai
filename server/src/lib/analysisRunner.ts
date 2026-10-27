import { prisma } from "./prisma.js";
import { fetchRepoStats, type GitHubProgress } from "./github.js";
import { computeTeamReport } from "@shared/scoring.js";
import { SCORING_RULES_VERSION } from "@shared/scoringRules.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { computeCombinedTeamReport } from "@shared/combinedScoring.js";
import { computeDocumentRawStats } from "../collab/editStats.js";
import { generateAlertsForProject } from "./alerts.js";
import { notify } from "./notify.js";
import { countByDay } from "./dayCounts.js";
import { ASSIGNMENT_CONFIG_SELECT, assignmentScoringConfig } from "./scoringConfig.js";
import { linkCommitsBestEffort } from "./taskCommitLinks.js";
import type { RawMemberStats, RawDocumentMemberStats, AnalyzeResponse, TeamReport, ProjectScoringConfig, DocumentScoredMember } from "@shared/types.js";
import { LATEST_REPORT_ORDER } from "./latestReport.js";
import { reportPolicy, type AnalysisTrigger } from "./resultsChange.js";
import { withAnalysisLock, ANALYSIS_IN_PROGRESS } from "./analysisLock.js";

// The analysis itself, independent of Express. routes/analyze.ts wraps it for the manual button
// (ownership, SSE); the automatic runs call it with a no-op progress emitter.

// Progress sink. The route's SSE emitter and the silent one below both implement it.
export interface ProgressEmitter {
  readonly stream: boolean;
  readonly opened: boolean;
  open(): void;
  emit(event: "github" | "docs" | "compute" | "save", data: object): void;
  finish(status: number, body: object): void;
}

// Used by automatic runs: nobody is listening, so every call does nothing.
export const silentProgress: ProgressEmitter = {
  stream: false,
  opened: false,
  open() {},
  emit() {},
  finish() {},
};

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

interface StoredReport { report?: TeamReport; narrative?: string; narrativeOutdated?: boolean }

export interface AnalysisResult {
  status: number;
  body: object;
  // true once progress.finish() has been called (the response is already written or streamed)
  streamed: boolean;
}

export interface AnalysisOptions {
  progress: ProgressEmitter;
  // The instructor who must own the class; null for system callers (automatic runs).
  actorInstructorId: number | null;
  // Who started this run; stored on the report and decides whether alerts are raised.
  trigger: AnalysisTrigger;
}

// Fetches activity, computes scores, saves a new Report row. Does NOT call Gemini: any previously
// saved narrative is carried forward, never generated here.
export async function runAnalysis(projectId: number, options: AnalysisOptions): Promise<AnalysisResult> {
  // One analysis per group at a time. Answered before any stream opens, so it is plain JSON.
  const locked = await withAnalysisLock(projectId, () => runAnalysisUnlocked(projectId, options));
  if (!locked.ran) return { status: 409, body: { ...ANALYSIS_IN_PROGRESS }, streamed: false };
  return locked.value;
}

async function runAnalysisUnlocked(projectId: number, { progress, actorInstructorId, trigger }: AnalysisOptions): Promise<AnalysisResult> {
  const done = (status: number, body: object): AnalysisResult => {
    progress.finish(status, body);
    return { status, body, streamed: true };
  };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: true,
      assignment: { select: { sourceType: true, deadline: true, ...ASSIGNMENT_CONFIG_SELECT, classSection: { select: { instructorId: true } } } },
      document: { select: { id: true } },
      groupMemberships: { include: { user: { select: { id: true, name: true, githubUsername: true } } } },
    },
  });
  if (!project) {
    return { status: 404, body: { error: `Project ${projectId} not found` }, streamed: false };
  }

  // Ownership: the instructor must own the class. A project with no assignment has no owner.
  if (actorInstructorId !== null && project.assignment?.classSection.instructorId !== actorInstructorId) {
    return { status: 403, body: { error: "You do not have access to this project" }, streamed: false };
  }

  const sourceType = project.assignment?.sourceType ?? null;
  const deadlineMs = project.assignment?.deadline ? project.assignment.deadline.getTime() : null;

  // A GitHub or Combined group can exist before it links a repository. Say so plainly instead of
  // letting the GitHub fetch fail with a parse error. Plain JSON, like the other pre-stream errors.
  if ((sourceType === "GITHUB" || sourceType === "COMBINED") && !project.repoUrl) {
    return { status: 409, body: { code: "REPO_NOT_LINKED", error: "Link a GitHub repository first." }, streamed: false };
  }

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

    const existing = await prisma.report.findFirst({ where: { projectId }, orderBy: [...LATEST_REPORT_ORDER] });
    const stored = existing?.content ? (JSON.parse(existing.content) as StoredReport) : {};
    const savedNarrative = stored.narrative ?? null;
    const policy = reportPolicy(trigger, stored, report, savedNarrative);
    progress.emit("save", {});
    const createdReport = await prisma.report.create({
      data: {
        projectId,
        gini:      report.gini,
        teamHealth: report.teamHealth,
        content:   JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins: [], scoringConfig: null, scoringRulesVersion: SCORING_RULES_VERSION, ...policy.contentExtras }),
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

    if (policy.notify) await notifyReportReady(project);

    if (policy.notify) generateAlertsForProject(projectId, report, {
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
    return done(200, response);
  }

  if (sourceType === "COMBINED") {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return done(500, { error: "GITHUB_TOKEN is not set" });
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
      fetchRepoStats(project.repoUrl ?? "", githubToken, requiredLogins, (p) => emitGithubProgress(progress, p, resolveName)),
      computeDocumentRawStats(project.document?.id ?? null, roster).then((raw) => {
        emitDocsProgress(progress, raw);
        return raw;
      }),
    ]);

    if (githubResult.status === "rejected") {
      const err = githubResult.reason;
      const e = err as { status?: number; message?: string };
      if (e.status === 404) {
        return done(404, { error: "GitHub repo not found or token lacks access", repoUrl: project.repoUrl });
      }
      if (e.status === 403 || e.status === 429) {
        return done(429, { error: "GitHub rate limit exceeded" });
      }
      return done(502, { error: "Failed to fetch GitHub stats", detail: e.message ?? String(err) });
    }
    if (docsResult.status === "rejected") throw docsResult.reason;

    const rawData = githubResult.value;
    const documentRaw = docsResult.value;

    const { rawMembers: githubRaw, unmatchedLogins } = buildRawMembers(project.members, rawData.contributors);

    // Settings come from the group's project (Assignment); the value used is snapshotted into the report.
    const scoringConfig: ProjectScoringConfig = assignmentScoringConfig(project.assignment);

    emitZeroCommitMembers(progress, githubRaw, rawData.contributors);
    progress.emit("compute", {});
    const githubReport = computeTeamReport(githubRaw, scoringConfig.weights, scoringConfig.thresholds, deadlineMs);

    const documentReport = computeDocumentTeamReport(documentRaw, undefined, undefined, deadlineMs);

    const report = computeCombinedTeamReport(
      roster, githubRaw, githubReport.members, documentRaw, documentReport.members,
      scoringConfig.blend!, scoringConfig.thresholds, deadlineMs
    );

    const existing = await prisma.report.findFirst({ where: { projectId }, orderBy: [...LATEST_REPORT_ORDER] });
    const stored = existing?.content ? (JSON.parse(existing.content) as StoredReport) : {};
    const savedNarrative = stored.narrative ?? null;
    const policy = reportPolicy(trigger, stored, report, savedNarrative);
    progress.emit("save", {});
    const createdReport = await prisma.report.create({
      data: {
        projectId,
        gini:      report.gini,
        teamHealth: report.teamHealth,
        content:   JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins, scoringConfig, scoringRulesVersion: SCORING_RULES_VERSION, ...policy.contentExtras }),
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

    if (policy.notify) await notifyReportReady(project);
    // Task commit linking (messages only). Best effort: never throws and never touches the report or scores.
    await linkCommitsBestEffort({ id: projectId, repoUrl: project.repoUrl });

    if (policy.notify) generateAlertsForProject(projectId, report, {
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
    return done(200, response);
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return done(500, { error: "GITHUB_TOKEN is not set" });
  }

  const requiredLogins = project.members.map((m) => m.githubUsername);
  console.log(`[analyze] project ${projectId}: ${requiredLogins.length} DB member(s): ${requiredLogins.join(", ")}`);

  const resolveName = githubNameResolver(project.members);
  let rawData: Awaited<ReturnType<typeof fetchRepoStats>>;
  try {
    progress.emit("github", { contributors: 0, commits: 0, files: 0 });
    rawData = await fetchRepoStats(project.repoUrl ?? "", githubToken, requiredLogins, (p) => emitGithubProgress(progress, p, resolveName));
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) {
      return done(404, { error: "GitHub repo not found or token lacks access", repoUrl: project.repoUrl });
    }
    if (e.status === 403 || e.status === 429) {
      return done(429, { error: "GitHub rate limit exceeded" });
    }
    return done(502, { error: "Failed to fetch GitHub stats", detail: e.message ?? String(err) });
  }

  console.log(`[analyze] project ${projectId}: GitHub returned ${rawData.contributors.length} contributor(s): ${rawData.contributors.map((c) => c.githubUsername).join(", ")}`);

  const { rawMembers, unmatchedLogins } = buildRawMembers(project.members, rawData.contributors);
  console.log(`[analyze] project ${projectId}: rawMembers built: ${rawMembers.length} — ${rawMembers.map((m) => `${m.githubUsername}(${m.commits})`).join(", ")}`);

  // Settings come from the group's project (Assignment); the value used is snapshotted into the report.
  // The GITHUB report carries no blend, as before.
  const { blend: _blend, ...scoringConfig }: ProjectScoringConfig = assignmentScoringConfig(project.assignment);

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
    orderBy: [...LATEST_REPORT_ORDER],
  });

  const stored = existing?.content
    ? (JSON.parse(existing.content) as StoredReport)
    : {};
  const savedNarrative = stored.narrative ?? null;
    const policy = reportPolicy(trigger, stored, report, savedNarrative);
  progress.emit("save", {});
  await prisma.report.create({
    data: {
      projectId,
      gini:      report.gini,
      teamHealth: report.teamHealth,
      content:   JSON.stringify({ report, narrative: savedNarrative, unmatchedLogins, scoringConfig, scoringRulesVersion: SCORING_RULES_VERSION, ...policy.contentExtras }),
    },
  });

  // Clear stale flags — report now reflects current membership and scoring config
  await prisma.project.update({
    where: { id: projectId },
    data:  { membershipChangedAt: null, scoringConfigChangedAt: null },
  });

  // Fire-and-forget: generate alerts for at-risk groups. Never blocks the response.
  if (policy.notify) await notifyReportReady(project);
  // Task commit linking (messages only). Best effort: never throws and never touches the report or scores.
  await linkCommitsBestEffort({ id: projectId, repoUrl: project.repoUrl });

  if (policy.notify) generateAlertsForProject(projectId, report, {
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

  return done(200, response);
}

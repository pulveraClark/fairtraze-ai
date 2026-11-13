import { prisma } from "./prisma.js";
import { parseRepoUrl } from "./github.js";
import { fetchLatestCommitTime } from "./githubCommitMessages.js";
import { projectsWithRepoChangedSince } from "./repoChange.js";
import { LATEST_REPORT_ORDER } from "./latestReport.js";
import { isRulesOutdated } from "@shared/scoringRules.js";
import { runAnalysis, silentProgress, type AnalysisResult } from "./analysisRunner.js";
import { isAnalysisRunning } from "./analysisLock.js";
import { isAnalysisFailureCode, type AnalysisFailureCode } from "@shared/failureMessages.js";
import { classifyGithubFailure } from "./githubFailure.js";

// Which groups get analyzed automatically, and whether anything changed since their last report.
// Planning only: nothing here touches the analyzer or the scoring maths.

/** A project stays active this long after its deadline (late work and late grading). MUST stay equal to AUTO_ANALYSIS_GRACE_DAYS in client/src/lib/analysisFreshness.ts, which drives the "Final report" wording. */
export const ACTIVE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A report older than this is refreshed in the background when someone opens it. */
export const REFRESH_ON_OPEN_AFTER_MS = 60 * 60 * 1000;

/**
 * Active = created, and not more than ACTIVE_GRACE_DAYS past the deadline. Assignment has no start
 * date, so createdAt stands in for it. No deadline means active.
 */
export function isProjectActive(assignment: { createdAt: Date; deadline: Date | null }, now: Date): boolean {
  if (assignment.createdAt.getTime() > now.getTime()) return false;
  if (!assignment.deadline) return true;
  return now.getTime() <= assignment.deadline.getTime() + ACTIVE_GRACE_DAYS * DAY_MS;
}

export interface DueGroup {
  id: number;
  repoUrl: string | null;
  sourceType: "GITHUB" | "EDITOR" | "COMBINED";
  documentId: number | null;
  membershipChangedAt: Date | null;
  scoringConfigChangedAt: Date | null;
}

const DUE_SELECT = {
  id: true,
  repoUrl: true,
  membershipChangedAt: true,
  scoringConfigChangedAt: true,
  document: { select: { id: true } },
  assignment: { select: { sourceType: true, createdAt: true, deadline: true } },
} as const;

type DueRow = {
  id: number;
  repoUrl: string | null;
  membershipChangedAt: Date | null;
  scoringConfigChangedAt: Date | null;
  document: { id: number } | null;
  assignment: { sourceType: "GITHUB" | "EDITOR" | "COMBINED"; createdAt: Date; deadline: Date | null } | null;
};

/** The one eligibility rule: active project, and (unless Docs-only) a linked repository. */
function toDueGroup(p: DueRow, now: Date): DueGroup | null {
  if (!p.assignment || !isProjectActive(p.assignment, now)) return null;
  if (p.assignment.sourceType !== "EDITOR" && !p.repoUrl) return null;
  return {
    id: p.id,
    repoUrl: p.repoUrl,
    sourceType: p.assignment.sourceType,
    documentId: p.document?.id ?? null,
    membershipChangedAt: p.membershipChangedAt,
    scoringConfigChangedAt: p.scoringConfigChangedAt,
  };
}

/** Active groups that have members and, unless Docs-only, a linked repository. */
export async function selectDueGroups(now: Date): Promise<DueGroup[]> {
  const projects = await prisma.project.findMany({
    where: { assignmentId: { not: null }, groupMemberships: { some: {} } },
    select: DUE_SELECT,
    orderBy: { id: "asc" },
  });
  return projects.map((p) => toDueGroup(p, now)).filter((g): g is DueGroup => g !== null);
}

/** One group under the same rules as selectDueGroups, or null when it is not eligible. */
export async function loadDueGroup(projectId: number, now: Date): Promise<DueGroup | null> {
  const p = await prisma.project.findFirst({
    where: { id: projectId, assignmentId: { not: null }, groupMemberships: { some: {} } },
    select: DUE_SELECT,
  });
  return p ? toDueGroup(p, now) : null;
}

export type ChangeReason =
  | "no-report"
  | "membership-changed"
  | "settings-changed"
  | "repo-changed"
  | "rules-outdated"
  | "new-docs-edits"
  | "new-commits";

export interface ChangeDeps {
  /** Newest commit time of a repo; replaced in tests. */
  latestCommitAt: (repoUrl: string, token: string) => Promise<Date | null>;
  githubToken: string | undefined;
}

const defaultDeps = (): ChangeDeps => ({
  latestCommitAt: (repoUrl, token) => {
    const { owner, repo } = parseRepoUrl(repoUrl);
    return fetchLatestCommitTime(owner, repo, token);
  },
  githubToken: process.env.GITHUB_TOKEN,
});

/**
 * Why this group should be analyzed again, or null when nothing changed since its latest report.
 * Cheap database checks run first; the single GitHub call is last. A GitHub error is thrown to the
 * caller (it decides how to treat rate limits).
 */
export async function reasonToReanalyze(
  group: DueGroup,
  lastReport: { id: number; generatedAt: Date; content: string | null } | null,
  deps: ChangeDeps = defaultDeps(),
): Promise<ChangeReason | null> {
  if (!lastReport) return "no-report";
  if (group.membershipChangedAt) return "membership-changed";
  if (group.scoringConfigChangedAt) return "settings-changed";
  if ((await projectsWithRepoChangedSince(new Map([[group.id, lastReport.generatedAt]]))).has(group.id)) return "repo-changed";

  let stored: { scoringRulesVersion?: number } | null = null;
  try {
    stored = lastReport.content ? (JSON.parse(lastReport.content) as { scoringRulesVersion?: number }) : null;
  } catch {
    stored = null;
  }
  if (isRulesOutdated(stored)) return "rules-outdated";

  if (group.sourceType !== "GITHUB" && group.documentId !== null) {
    const edit = await prisma.editEvent.findFirst({
      where: { documentId: group.documentId, timestamp: { gt: lastReport.generatedAt } },
      select: { id: true },
    });
    if (edit) return "new-docs-edits";
  }

  if (group.sourceType !== "EDITOR" && group.repoUrl && deps.githubToken) {
    const latest = await deps.latestCommitAt(group.repoUrl, deps.githubToken);
    if (latest && latest.getTime() > lastReport.generatedAt.getTime()) return "new-commits";
  }
  return null;
}

export function latestReportOf(projectId: number) {
  return prisma.report.findFirst({
    where: { projectId },
    orderBy: [...LATEST_REPORT_ORDER],
    select: { id: true, generatedAt: true, content: true },
  });
}

export interface AutoRunSummary {
  analyzed: number;
  skipped: number;
  failed: number;
  /** Subset of skipped: not looked at because GitHub's rate limit was hit earlier in this run. */
  skippedRateLimited: number;
  /** Subset of skipped: another analysis already held the group. */
  skippedLocked: number;
}

export interface AutoRunDeps {
  change: ChangeDeps;
  analyze: (projectId: number) => Promise<AnalysisResult>;
  log: (line: string) => void;
}

const defaultRunDeps = (): AutoRunDeps => ({
  change: defaultDeps(),
  analyze: (projectId) => runAnalysis(projectId, { progress: silentProgress, actorInstructorId: null, trigger: "auto" }),
  log: (line) => console.log(line),
});

// A thrown GitHub error: a real rate limit (429, or 403 with the limit used up) is told apart from a 403 that
// just means "no access to this repository", which is a failure worth showing, not something to wait out.
const hasHttpStatus = (err: unknown) => typeof (err as { status?: unknown } | null)?.status === "number";

/**
 * Remembers that an automatic run for this group did not finish, so its report page can say so calmly.
 * Display only (the next analysis that saves a report clears it); never throws, never touches a report.
 */
export async function recordAutoFailure(projectId: number, code: AnalysisFailureCode): Promise<void> {
  try {
    await prisma.project.update({
      where: { id: projectId },
      data:  { lastAutoFailureAt: new Date(), lastAutoFailureCode: code },
    });
  } catch (err) {
    console.error(`[auto-analyze] could not record the failure for group ${projectId}:`, err instanceof Error ? err.message : err);
  }
}

/** The short code for a finished-but-failed analysis result (its body carries one for GitHub failures). */
function failureCodeOf(result: AnalysisResult): AnalysisFailureCode {
  const code = (result.body as { code?: unknown }).code;
  return isAnalysisFailureCode(code) ? code : "ANALYSIS_FAILED";
}

/**
 * Should the report page say the latest automatic update did not finish? Only while that is still true and
 * still useful: the failure is newer than the report (a later analysis clears it anyway) and the project is
 * in its active window, so "it will try again tonight" is accurate. Display only.
 */
export function autoUpdateFailed(
  project: { lastAutoFailureAt: Date | null },
  assignment: { createdAt: Date; deadline: Date | null } | null,
  reportGeneratedAt: Date,
  now: Date = new Date(),
): boolean {
  if (!project.lastAutoFailureAt || !assignment) return false;
  if (project.lastAutoFailureAt.getTime() <= reportGeneratedAt.getTime()) return false;
  return isProjectActive(assignment, now);
}

/** True when an automatic result is a real failure (not success, and not "someone else already holds the group"). */
const isFailedResult = (result: AnalysisResult) => result.status !== 200 && result.status !== 409;

/**
 * Analyzes every due group whose data changed, one at a time. A failure in one group never stops the
 * others. After GitHub says "rate limited" the remaining groups that need GitHub are skipped (Docs-only
 * groups still run). Never calls Gemini; alerts are raised only for changed results (see reportPolicy).
 */
export async function runAutoAnalysis(now: Date = new Date(), deps: AutoRunDeps = defaultRunDeps()): Promise<AutoRunSummary> {
  const summary: AutoRunSummary = { analyzed: 0, skipped: 0, failed: 0, skippedRateLimited: 0, skippedLocked: 0 };
  const groups = await selectDueGroups(now);
  let rateLimited = false;
  // Without the token the new-commit check is skipped, so GitHub groups would never update on their own.
  // Say so in the log (once per run) instead of failing silently.
  if (!deps.change.githubToken && groups.some((g) => g.sourceType !== "EDITOR" && g.repoUrl)) {
    deps.log("[auto-analyze] warning: GITHUB_TOKEN is not set, so new commits cannot be detected and GitHub groups only update when something else changed");
  }

  for (const group of groups) {
    const needsGithub = group.sourceType !== "EDITOR";
    if (rateLimited && needsGithub) {
      summary.skipped++;
      summary.skippedRateLimited++;
      continue;
    }
    try {
      const reason = await reasonToReanalyze(group, await latestReportOf(group.id), deps.change);
      if (!reason) {
        summary.skipped++;
        continue;
      }
      const result = await deps.analyze(group.id);
      if (result.status === 200) summary.analyzed++;
      else if (result.status === 409) { summary.skipped++; summary.skippedLocked++; }
      else if (result.status === 429) {
        // Rate limited: wait for the next scheduled run. Nothing is marked failed and the latest report stays.
        rateLimited = true;
        summary.skipped++;
        summary.skippedRateLimited++;
        deps.log(`[auto-analyze] group ${group.id}: GitHub rate limit, will retry on the next run`);
      } else {
        summary.failed++;
        deps.log(`[auto-analyze] group ${group.id} failed: status ${result.status}`);
        await recordAutoFailure(group.id, failureCodeOf(result));
      }
    } catch (err) {
      const github = hasHttpStatus(err) ? classifyGithubFailure(err) : null;
      if (github?.code === "GITHUB_RATE_LIMITED") {
        rateLimited = true;
        summary.skipped++;
        summary.skippedRateLimited++;
        deps.log(`[auto-analyze] group ${group.id}: GitHub rate limit, will retry on the next run`);
      } else {
        summary.failed++;
        deps.log(`[auto-analyze] group ${group.id} failed: ${err instanceof Error ? err.message : String(err)}`);
        await recordAutoFailure(group.id, github?.code ?? "ANALYSIS_FAILED");
      }
    }
  }

  deps.log(
    `[auto-analyze] done: ${summary.analyzed} analyzed, ${summary.skipped} skipped` +
      ` (${summary.skippedLocked} busy, ${summary.skippedRateLimited} rate limited), ${summary.failed} failed, of ${groups.length} due`
  );
  return summary;
}

let batchRunning = false;

/** Starts a run in the background unless one is already going. Never throws; the summary is logged. */
export function startAutoAnalysisInBackground(): { started: boolean } {
  if (batchRunning) return { started: false };
  batchRunning = true;
  runAutoAnalysis()
    .catch((err) => console.error("[auto-analyze] run crashed:", err))
    .finally(() => { batchRunning = false; });
  return { started: true };
}

// ── Refresh on open ──────────────────────────────────────────────────────────

/** A group is checked for news at most this often, however many people open its report. */
export const REFRESH_CHECK_COOLDOWN_MS = 5 * 60 * 1000;
const lastChecked = new Map<number, number>();

export function resetRefreshCooldown(): void {
  lastChecked.clear();
}

export type RefreshDecision =
  | { refreshing: true }
  | { refreshing: false; why: "not-eligible" | "no-report" | "recent" | "busy" | "checked-recently" | "unchanged" };

export interface RefreshDeps {
  change: ChangeDeps;
  /** Starts the analysis; not awaited by the caller. */
  analyze: (projectId: number) => Promise<AnalysisResult>;
}

/**
 * Called when someone opens a report. Starts a background analysis ONLY when every condition holds:
 * the group is eligible and its project active, the latest report is older than
 * REFRESH_ON_OPEN_AFTER_MS, nothing is already analyzing it, and something changed since that report.
 * It looks only at database state and the clock - the caller cannot ask for a run, so a student who
 * calls it repeatedly gets the same answer as the instructor.
 */
export async function refreshReportIfStale(
  projectId: number,
  now: Date = new Date(),
  deps: RefreshDeps = {
    change: defaultDeps(),
    analyze: (id) => runAnalysis(id, { progress: silentProgress, actorInstructorId: null, trigger: "auto" }),
  },
): Promise<RefreshDecision> {
  const group = await loadDueGroup(projectId, now);
  if (!group) return { refreshing: false, why: "not-eligible" };

  const last = await latestReportOf(projectId);
  if (!last) return { refreshing: false, why: "no-report" };
  if (now.getTime() - last.generatedAt.getTime() <= REFRESH_ON_OPEN_AFTER_MS) return { refreshing: false, why: "recent" };
  if (isAnalysisRunning(projectId)) return { refreshing: false, why: "busy" };

  const before = lastChecked.get(projectId);
  if (before !== undefined && now.getTime() - before < REFRESH_CHECK_COOLDOWN_MS) return { refreshing: false, why: "checked-recently" };
  lastChecked.set(projectId, now.getTime());

  let reason: ChangeReason | null;
  try {
    reason = await reasonToReanalyze(group, last, deps.change);
  } catch (err) {
    console.error(`[auto-analyze] change check for group ${projectId} failed:`, err instanceof Error ? err.message : err);
    return { refreshing: false, why: "unchanged" };
  }
  if (!reason) return { refreshing: false, why: "unchanged" };

  deps.analyze(projectId)
    // A rate limit is waited out (the scheduled run retries); only real failures are remembered.
    .then((result) => { if (isFailedResult(result) && result.status !== 429) return recordAutoFailure(projectId, failureCodeOf(result)); })
    .catch((err) => {
      console.error(`[auto-analyze] refresh of group ${projectId} failed:`, err);
      const github = hasHttpStatus(err) ? classifyGithubFailure(err) : null;
      if (github?.code === "GITHUB_RATE_LIMITED") return undefined;
      return recordAutoFailure(projectId, github?.code ?? "ANALYSIS_FAILED");
    });
  return { refreshing: true };
}

import { prisma } from "./prisma.js";
import { parseRepoUrl } from "./github.js";
import { fetchLatestCommitTime } from "./githubCommitMessages.js";
import { projectsWithRepoChangedSince } from "./repoChange.js";
import { LATEST_REPORT_ORDER } from "./latestReport.js";
import { isRulesOutdated } from "@shared/scoringRules.js";
import { runAnalysis, silentProgress, type AnalysisResult } from "./analysisRunner.js";

// Which groups get analyzed automatically, and whether anything changed since their last report.
// Planning only: nothing here touches the analyzer or the scoring maths.

/** A project stays active this long after its deadline (late work and late grading). */
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

/** Active groups that have members and, unless Docs-only, a linked repository. */
export async function selectDueGroups(now: Date): Promise<DueGroup[]> {
  const projects = await prisma.project.findMany({
    where: { assignmentId: { not: null }, groupMemberships: { some: {} } },
    select: {
      id: true,
      repoUrl: true,
      membershipChangedAt: true,
      scoringConfigChangedAt: true,
      document: { select: { id: true } },
      assignment: { select: { sourceType: true, createdAt: true, deadline: true } },
    },
    orderBy: { id: "asc" },
  });
  const out: DueGroup[] = [];
  for (const p of projects) {
    if (!p.assignment || !isProjectActive(p.assignment, now)) continue;
    if (p.assignment.sourceType !== "EDITOR" && !p.repoUrl) continue;
    out.push({
      id: p.id,
      repoUrl: p.repoUrl,
      sourceType: p.assignment.sourceType,
      documentId: p.document?.id ?? null,
      membershipChangedAt: p.membershipChangedAt,
      scoringConfigChangedAt: p.scoringConfigChangedAt,
    });
  }
  return out;
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

const isRateLimit = (err: unknown) => {
  const status = (err as { status?: number } | null)?.status;
  return status === 403 || status === 429;
};

/**
 * Analyzes every due group whose data changed, one at a time. A failure in one group never stops the
 * others. After GitHub says "rate limited" the remaining groups that need GitHub are skipped (Docs-only
 * groups still run). Never calls Gemini; alerts are raised only for changed results (see reportPolicy).
 */
export async function runAutoAnalysis(now: Date = new Date(), deps: AutoRunDeps = defaultRunDeps()): Promise<AutoRunSummary> {
  const summary: AutoRunSummary = { analyzed: 0, skipped: 0, failed: 0, skippedRateLimited: 0, skippedLocked: 0 };
  const groups = await selectDueGroups(now);
  let rateLimited = false;

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
        rateLimited = true;
        summary.skipped++;
        summary.skippedRateLimited++;
      } else {
        summary.failed++;
        deps.log(`[auto-analyze] group ${group.id} failed: status ${result.status}`);
      }
    } catch (err) {
      if (isRateLimit(err)) {
        rateLimited = true;
        summary.skipped++;
        summary.skippedRateLimited++;
      } else {
        summary.failed++;
        deps.log(`[auto-analyze] group ${group.id} failed: ${err instanceof Error ? err.message : String(err)}`);
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

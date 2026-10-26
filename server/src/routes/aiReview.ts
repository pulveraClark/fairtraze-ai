import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { loadGroup, isInstructorOf, type LoadedGroup } from "../lib/groupAccess.js";
import { LATEST_REPORT_ORDER } from "../lib/latestReport.js";
import { aiReviewEnabled } from "../lib/geminiClient.js";
import { isReviewRunning, startReview } from "../lib/aiReview/reviewLock.js";
import { generateMemberSummaries } from "../lib/aiReview/memberSummaries.js";
import { generateBriefComparison } from "../lib/aiReview/briefComparison.js";
import { briefHash } from "../lib/aiReview/briefEvidence.js";
import { AI_REVIEW_PROMPT_VERSION, BRIEF_PROMPT_VERSION } from "../lib/aiReview/prompts.js";
import { canonicalRepoUrl, linkFile, repoRefOf, type RepoRef } from "../lib/aiReview/evidenceLinks.js";
import type {
  AiMemberSummariesContent, AiMemberSummary, AiAddressedNote, AiBriefContent, AiRequirementStatus, AiFileLinks,
} from "@shared/aiReviewTypes.js";

export const aiReviewRouter = Router();

export type AiViewer = "instructor" | "leader" | "member";

export interface AiMemberSummaryView extends AiMemberSummary {
  name: string;
  // Lets the report match a GitHub-only member (who has no user id in the stored report).
  githubUsername: string | null;
  isYou: boolean;
}

export interface AiPerson {
  name: string;
  githubUsername: string | null;
}

// Who sees what, decided here and nowhere else:
//  - a member sees only their own summary;
//  - the group leader and the owning instructor see every member's summary;
//  - evidence is the same for all of them and holds only file paths and Docs section headings
//    (never document text), so a leader never reads another member's Docs words;
//  - "text addressed to the AI" notes, status and error codes are for the instructor only.
export function shapeSummariesForViewer(
  content: AiMemberSummariesContent,
  viewer: AiViewer,
  viewerUserId: number,
  people: Map<number, AiPerson>,
  repo: RepoRef | null = null,
): { summaries: AiMemberSummaryView[]; aiAddressed?: Array<AiAddressedNote & { name: string }> } {
  const visible = viewer === "member" ? content.members.filter((m) => m.userId === viewerUserId) : content.members;
  const summaries = visible.map((m) => ({
    ...m,
    // Links are built here, at read time, from the stored shas; `commits` itself is not sent.
    evidence: {
      ...m.evidence,
      files: m.evidence.files.map(({ commits, ...f }) => ({ ...f, ...(linkFile(repo, f.path, commits) ?? {}) })),
    },
    name: people.get(m.userId)?.name ?? "Former member",
    githubUsername: people.get(m.userId)?.githubUsername ?? null,
    isYou: m.userId === viewerUserId,
  }));
  if (viewer !== "instructor") return { summaries };
  return {
    summaries,
    aiAddressed: content.aiAddressed.map((a) => ({ ...a, name: people.get(a.userId)?.name ?? "Former member" })),
  };
}

export interface AiBriefView {
  requirements: Array<{
    text: string;
    status: AiRequirementStatus;
    unverified: boolean;
    evidence: Array<{ type: "file" | "doc"; ref: string; quote: string; quoteHidden: boolean } & AiFileLinks>;
  }>;
  // True when no requirement was found (all Not found). The page shows one calm line.
  nothingFound: boolean;
  generatedAt: string;
  outdated: boolean;
  // Instructor only.
  aiAddressedCount?: number;
}

// The brief check is for the owning instructor and the group leader, never other members.
// Same wording and evidence for both; the leader sees only the section heading, not the quoted words,
// for Docs text written by anyone else. Returns null (card hidden) when the brief is empty, the run
// failed or was skipped, or the AI listed no requirements.
export function shapeBriefForViewer(
  row: { status: string; content: unknown; promptVersion: string; briefHash: string | null; reportId: number; createdAt: Date } | null,
  viewer: AiViewer,
  viewerUserId: number,
  current: { brief: string; latestReportId: number | null },
  repo: RepoRef | null = null,
): AiBriefView | null {
  if (!row || viewer === "member" || !current.brief.trim()) return null;
  if (row.status === "FAILED" || row.status === "SKIPPED") return null;
  const content = row.content as AiBriefContent;
  if (!content.requirements?.length) return null;
  const requirements = content.requirements.map((r) => ({
    text: r.text,
    status: r.status,
    unverified: !!r.unverified,
    evidence: r.evidence.map((e) => {
      const othersWrote = e.type === "doc" && viewer === "leader" && (!e.authors || e.authors.length === 0 || e.authors.some((a) => a !== viewerUserId));
      const links = e.type === "file" ? (linkFile(repo, e.ref, e.commits) ?? {}) : {};
      return { type: e.type, ref: e.ref, quote: othersWrote ? "" : e.quote, quoteHidden: othersWrote, ...links };
    }),
  }));
  return {
    requirements,
    nothingFound: requirements.every((r) => r.status === "NOT_FOUND"),
    generatedAt: row.createdAt.toISOString(),
    outdated: row.reportId !== current.latestReportId || row.promptVersion !== BRIEF_PROMPT_VERSION || row.briefHash !== briefHash(current.brief),
    ...(viewer === "instructor" ? { aiAddressedCount: content.aiAddressedCount ?? 0 } : {}),
  };
}

const idParam = z.coerce.number().int().positive();

async function classSwitchOn(project: LoadedGroup): Promise<boolean> {
  const classSectionId = project.assignment?.classSectionId;
  if (!classSectionId) return false;
  const cs = await prisma.classSection.findUnique({ where: { id: classSectionId }, select: { aiReviewEnabled: true } });
  return !!cs?.aiReviewEnabled;
}

// GET /api/groups/:id/ai-review - the stored AI review of the group's work, shaped for the caller.
// Never calls Gemini. `{ enabled: false }` when the server switch or the class switch is off.
aiReviewRouter.get("/api/groups/:id/ai-review", requireAuth, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroup(id.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  const me = project.groupMemberships.find((m) => m.userId === req.user!.sub);
  const instructor = isInstructorOf(req, project);
  if (!me && !instructor) {
    res.status(403).json({ error: "You do not have access to this group." });
    return;
  }
  if (!aiReviewEnabled() || !(await classSwitchOn(project))) {
    res.json({ enabled: false });
    return;
  }

  const viewer: AiViewer = instructor ? "instructor" : me!.role === "LEADER" ? "leader" : "member";
  const latestReport = await prisma.report.findFirst({
    where: { projectId: project.id },
    orderBy: [...LATEST_REPORT_ORDER],
    select: { id: true, generatedAt: true },
  });
  const review = await prisma.aiReportReview.findFirst({
    where: { kind: "MEMBER_SUMMARIES", report: { projectId: project.id } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const repo = repoRefOf(project.repoUrl);
  const base = {
    enabled: true,
    // Where file evidence links to; the viewer already sees this group's repository.
    repoUrl: canonicalRepoUrl(repo),
    running: isReviewRunning(project.id),
    canGenerate: instructor && req.user!.role === "INSTRUCTOR",
    hasReport: !!latestReport,
  };
  // Brief check: instructor and leader only. Computed before the early return so it shows even if
  // the member summaries have not been written.
  let brief: { briefCheck?: AiBriefView; briefFailed?: boolean } = {};
  if (viewer !== "member") {
    const [assignment, briefRow] = await Promise.all([
      prisma.assignment.findFirst({ where: { projects: { some: { id: project.id } } }, select: { description: true } }),
      prisma.aiReportReview.findFirst({
        where: { kind: "BRIEF_COMPARISON", report: { projectId: project.id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);
    const text = assignment?.description ?? "";
    const view = shapeBriefForViewer(briefRow, viewer, req.user!.sub, { brief: text, latestReportId: latestReport?.id ?? null }, repo);
    if (view) brief.briefCheck = view;
    if (viewer === "instructor" && briefRow?.status === "FAILED" && text.trim()) brief.briefFailed = true;
  }

  if (!review) {
    res.json({ ...base, generatedAt: null, summaries: null, ...brief });
    return;
  }

  const people = new Map(project.groupMemberships.map((m) => [m.userId, { name: m.user.name, githubUsername: m.user.githubUsername ?? null }]));
  const shaped = shapeSummariesForViewer(review.content as unknown as AiMemberSummariesContent, viewer, req.user!.sub, people, repo);
  const basedOn = await prisma.report.findUnique({ where: { id: review.reportId }, select: { generatedAt: true } });
  res.json({
    ...base,
    generatedAt: review.createdAt.toISOString(),
    basedOnReportAt: basedOn?.generatedAt.toISOString() ?? null,
    // The analysis moved on (or the prompt changed) since this review was written.
    outdated: review.reportId !== latestReport?.id || review.promptVersion !== AI_REVIEW_PROMPT_VERSION,
    summaries: shaped.summaries,
    ...brief,
    ...(viewer === "instructor"
      ? { status: review.status, errorCode: review.errorCode, aiAddressed: shaped.aiAddressed }
      : {}),
  });
});

// POST /api/groups/:id/ai-review - the owning instructor starts a review of the latest report.
// Answers 202 at once; the work runs in the background and the page polls GET. Manual only.
aiReviewRouter.post("/api/groups/:id/ai-review", ...requireRole("INSTRUCTOR"), requireVerifiedEmail, async (req, res) => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroup(id.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!isInstructorOf(req, project)) {
    res.status(403).json({ error: "You do not have access to this group." });
    return;
  }
  if (!aiReviewEnabled()) {
    res.status(409).json({ code: "AI_REVIEW_DISABLED", error: "AI review is not turned on." });
    return;
  }
  if (!(await classSwitchOn(project))) {
    res.status(409).json({ code: "AI_REVIEW_OFF_FOR_CLASS", error: "AI review is turned off for this class." });
    return;
  }
  const hasReport = await prisma.report.count({ where: { projectId: project.id } });
  if (hasReport === 0) {
    res.status(409).json({ code: "NO_REPORT", error: "Analyze this group first." });
    return;
  }
  const started = startReview(project.id, async () => {
    // Two independent parts; one failing never stops the other.
    for (const part of [generateMemberSummaries, generateBriefComparison]) {
      try {
        await part(project.id);
      } catch (err) {
        console.error(`[ai-review] group ${project.id} ${part.name} failed:`, err);
      }
    }
  });
  if (!started) {
    res.status(409).json({ code: "REVIEW_IN_PROGRESS", error: "A review of this group is already running." });
    return;
  }
  res.status(202).json({ running: true });
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { loadGroup, isInstructorOf, type LoadedGroup } from "../lib/groupAccess.js";
import { LATEST_REPORT_ORDER } from "../lib/latestReport.js";
import { aiReviewEnabled } from "../lib/geminiClient.js";
import { isReviewRunning, startReview } from "../lib/aiReview/reviewLock.js";
import { generateMemberSummaries } from "../lib/aiReview/memberSummaries.js";
import { AI_REVIEW_PROMPT_VERSION } from "../lib/aiReview/prompts.js";
import type { AiMemberSummariesContent, AiMemberSummary, AiAddressedNote } from "@shared/aiReviewTypes.js";

export const aiReviewRouter = Router();

export type AiViewer = "instructor" | "leader" | "member";

export interface AiMemberSummaryView extends AiMemberSummary {
  name: string;
  isYou: boolean;
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
  names: Map<number, string>,
): { summaries: AiMemberSummaryView[]; aiAddressed?: Array<AiAddressedNote & { name: string }> } {
  const visible = viewer === "member" ? content.members.filter((m) => m.userId === viewerUserId) : content.members;
  const summaries = visible.map((m) => ({ ...m, name: names.get(m.userId) ?? "Former member", isYou: m.userId === viewerUserId }));
  if (viewer !== "instructor") return { summaries };
  return {
    summaries,
    aiAddressed: content.aiAddressed.map((a) => ({ ...a, name: names.get(a.userId) ?? "Former member" })),
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

  const base = {
    enabled: true,
    running: isReviewRunning(project.id),
    canGenerate: instructor && req.user!.role === "INSTRUCTOR",
    hasReport: !!latestReport,
  };
  if (!review) {
    res.json({ ...base, generatedAt: null, summaries: null });
    return;
  }

  const names = new Map(project.groupMemberships.map((m) => [m.userId, m.user.name]));
  const shaped = shapeSummariesForViewer(review.content as unknown as AiMemberSummariesContent, viewer, req.user!.sub, names);
  const basedOn = await prisma.report.findUnique({ where: { id: review.reportId }, select: { generatedAt: true } });
  res.json({
    ...base,
    generatedAt: review.createdAt.toISOString(),
    basedOnReportAt: basedOn?.generatedAt.toISOString() ?? null,
    // The analysis moved on (or the prompt changed) since this review was written.
    outdated: review.reportId !== latestReport?.id || review.promptVersion !== AI_REVIEW_PROMPT_VERSION,
    summaries: shaped.summaries,
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
    await generateMemberSummaries(project.id);
  });
  if (!started) {
    res.status(409).json({ code: "REVIEW_IN_PROGRESS", error: "A review of this group is already running." });
    return;
  }
  res.status(202).json({ running: true });
});

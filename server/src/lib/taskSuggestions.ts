import type { AiBriefContent } from "@shared/aiReviewTypes.js";
import type { TaskSuggestion } from "@shared/taskTypes.js";
import { prisma } from "./prisma.js";
import { requirementKeys } from "./requirementMarks.js";

// "From the project instructions" suggestions for the New task title. Planning aid only: it reads the
// group's latest STORED brief check (the instructor's manual Generate; no AI call happens here) and sends
// the requirement text only: no evidence, quotes or authors. Nothing here is read by scoring.

/** Requirements of the group's latest stored check that have a stable key, in the AI's order. */
export async function latestCheckRequirements(projectId: number): Promise<Array<{ key: string; text: string }>> {
  const row = await prisma.aiReportReview.findFirst({
    where: { kind: "BRIEF_COMPARISON", status: { not: "FAILED" }, report: { projectId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { content: true },
  });
  const reqs = (row?.content as unknown as AiBriefContent | null)?.requirements ?? [];
  const keys = requirementKeys(reqs);
  const out: Array<{ key: string; text: string }> = [];
  reqs.forEach((r, i) => {
    const key = keys[i];
    const text = r.text?.trim();
    if (key && text) out.push({ key, text });
  });
  return out;
}

/** Items of the latest check that no task of the group was created from yet. */
export async function openSuggestions(projectId: number): Promise<TaskSuggestion[]> {
  const reqs = await latestCheckRequirements(projectId);
  if (!reqs.length) return [];
  const used = await prisma.task.findMany({
    where: { projectId, requirementKey: { in: reqs.map((r) => r.key) } },
    select: { requirementKey: true },
  });
  const usedKeys = new Set(used.map((t) => t.requirementKey));
  return reqs.filter((r) => !usedKeys.has(r.key)).map((r) => ({ key: r.key, text: r.text }));
}

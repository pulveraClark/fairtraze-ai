import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, isInstructorOf, leaderMembership } from "../lib/groupAccess.js";
import type { LoadedGroup } from "../lib/groupAccess.js";
import { attachmentMetaFor, sniffBriefMime } from "../lib/briefAttachments.js";
import { cleanNote, isMarkStale, requirementKeys, MARK_IMAGE_MAX_BYTES } from "../lib/requirementMarks.js";
import { isMarkable, MARK_ALREADY_COVERED, MARK_ITEM_MISSING } from "@shared/requirementMarkable.js";
import type { AiBriefContent, AiBriefRequirement } from "@shared/aiReviewTypes.js";

// "We have this" marks on project-instructions requirements the AI could not confirm. The leader of the group
// claims, the owning instructor confirms (or asks for a closer look, or marks any item "I checked: covered").
// A leader claim never counts as covered until the instructor confirms. Visible only to the group's members and
// the owning instructor; deleted with the project. Context only: never read by scoring or any AI prompt.

export const requirementMarksRouter = Router();

export const MARK_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MARK_RAW_LIMIT = "1100kb";

// Reject a body-too-large from express.raw as a clean 413 instead of a stack trace.
export function markBodyErrors(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if ((err as { type?: string })?.type === "entity.too.large") {
    res.status(413).json({ error: "That picture is too large (max 1 MB)." });
    return;
  }
  next(err);
}

const idParam = z.coerce.number().int().positive();
const keyBody = z.object({
  requirementKey: z.string().regex(/^[0-9a-f]{32}$/),
  note: z.string().max(400).optional(),
});

type Mark = Awaited<ReturnType<typeof prisma.requirementMark.findMany>>[number];

async function openGroup(req: Request, res: Response, idRaw: unknown): Promise<LoadedGroup | null> {
  const id = idParam.safeParse(idRaw);
  if (!id.success) { res.status(400).json({ error: "Invalid group id" }); return null; }
  const project = await loadGroup(id.data);
  if (!project) { res.status(404).json({ error: "Group not found." }); return null; }
  const member = project.groupMemberships.some((m) => m.userId === req.user!.sub);
  if (!member && !isInstructorOf(req, project)) {
    res.status(403).json({ error: "You do not have access to this group." });
    return null;
  }
  return project;
}

/** The requirements of the group's latest stored check, with the key of each. */
async function latestRequirements(projectId: number): Promise<Array<{ key: string; r: AiBriefRequirement }>> {
  const row = await prisma.aiReportReview.findFirst({
    where: { kind: "BRIEF_COMPARISON", report: { projectId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { content: true },
  });
  const reqs = (row?.content as unknown as AiBriefContent | undefined)?.requirements ?? [];
  const keys = requirementKeys(reqs);
  const out: Array<{ key: string; r: AiBriefRequirement }> = [];
  reqs.forEach((r, i) => { const key = keys[i]; if (key) out.push({ key, r }); });
  return out;
}

async function currentInstructions(projectId: number): Promise<{ description: string; attachmentNames: string[] }> {
  const asg = await prisma.assignment.findFirst({ where: { projects: { some: { id: projectId } } }, select: { id: true, description: true } });
  const meta = asg ? (await attachmentMetaFor([asg.id])).get(asg.id) ?? [] : [];
  return { description: asg?.description ?? "", attachmentNames: meta.map((a) => a.filename) };
}

const owningInstructor = (req: Request, project: LoadedGroup) => req.user!.role === "INSTRUCTOR" && isInstructorOf(req, project);

// GET /api/groups/:id/requirement-marks - every mark of the group, for its members and the owning instructor.
requirementMarksRouter.get("/api/groups/:id/requirement-marks", requireAuth, async (req, res) => {
  const project = await openGroup(req, res, req.params.id);
  if (!project) return;
  const [rows, current, latest] = await Promise.all([
    prisma.requirementMark.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      include: { markedBy: { select: { id: true, name: true } } },
    }),
    currentInstructions(project.id),
    latestRequirements(project.id),
  ]);
  // A mark whose key is no longer in the latest check (a sibling the AI reworded) reads stale, never moves.
  const liveKeys = new Set(latest.map((x) => x.key));
  res.set("Cache-Control", "private, no-cache");
  res.json({
    marks: rows.map((m) => ({
      id: m.id,
      requirementKey: m.requirementKey,
      requirementText: m.requirementText,
      role: m.role,
      status: m.status,
      note: m.note,
      hasImage: m.imageData !== null,
      imageUrl: m.imageData !== null ? `/api/groups/${project.id}/requirement-marks/${m.id}/image` : null,
      markedBy: { id: m.markedBy.id, name: m.markedBy.name },
      markedByYou: m.markedById === req.user!.sub,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      stale: isMarkStale(m, current) || (liveKeys.size > 0 && !liveKeys.has(m.requirementKey)),
    })),
  });
});

async function upsertMark(
  project: LoadedGroup, userId: number, role: "LEADER" | "INSTRUCTOR", status: "LEADER_CLAIM" | "INSTRUCTOR_CONFIRMED",
  found: { key: string; r: AiBriefRequirement }, note: string | null,
): Promise<Mark> {
  const data = {
    requirementText: found.r.text.slice(0, 200),
    sourceQuote: found.r.sourceQuote ?? null,
    sourceFile: found.r.sourceFile ?? null,
    sourcePage: found.r.sourcePage ?? null,
    status, markedById: userId, note,
  };
  return prisma.requirementMark.upsert({
    where: { projectId_requirementKey_role: { projectId: project.id, requirementKey: found.key, role } },
    create: { projectId: project.id, requirementKey: found.key, role, ...data },
    update: data,
  });
}

// POST .../requirement-marks/claim - "We have this": the LEADER of this group, on an item the AI could not
// confirm. Sending again after "The instructor wants a closer look" replaces the note.
requirementMarksRouter.post("/api/groups/:id/requirement-marks/claim", requireAuth, async (req, res) => {
  const project = await openGroup(req, res, req.params.id);
  if (!project) return;
  if (!leaderMembership(req, project)) {
    res.status(403).json({ error: "Only the group leader can mark this." });
    return;
  }
  const body = keyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const found = (await latestRequirements(project.id)).find((x) => x.key === body.data.requirementKey);
  if (!found) { res.status(404).json({ error: MARK_ITEM_MISSING }); return; }
  if (!isMarkable(found.r)) { res.status(409).json({ error: MARK_ALREADY_COVERED }); return; }
  const confirmed = await prisma.requirementMark.findUnique({
    where: { projectId_requirementKey_role: { projectId: project.id, requirementKey: found.key, role: "INSTRUCTOR" } },
    select: { id: true },
  });
  if (confirmed) { res.status(409).json({ error: "Your instructor already confirmed this one." }); return; }
  const mark = await upsertMark(project, req.user!.sub, "LEADER", "LEADER_CLAIM", found, cleanNote(body.data.note));
  res.status(201).json({ id: mark.id });
});

// POST .../requirement-marks/confirm - the OWNING instructor: confirm a leader's claim, or "I checked: covered"
// on any item (with an optional note).
requirementMarksRouter.post("/api/groups/:id/requirement-marks/confirm", requireAuth, async (req, res) => {
  const project = await openGroup(req, res, req.params.id);
  if (!project) return;
  if (!owningInstructor(req, project)) {
    res.status(403).json({ error: "Only the instructor of this class can confirm this." });
    return;
  }
  const body = keyBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const found = (await latestRequirements(project.id)).find((x) => x.key === body.data.requirementKey);
  if (!found) { res.status(404).json({ error: MARK_ITEM_MISSING }); return; }
  const mark = await upsertMark(project, req.user!.sub, "INSTRUCTOR", "INSTRUCTOR_CONFIRMED", found, cleanNote(body.data.note));
  res.status(201).json({ id: mark.id });
});

// PATCH .../requirement-marks/:markId/decline - "Not yet": the instructor asks for a closer look at a leader's claim.
requirementMarksRouter.patch("/api/groups/:id/requirement-marks/:markId/decline", requireAuth, async (req, res) => {
  const project = await openGroup(req, res, req.params.id);
  if (!project) return;
  if (!owningInstructor(req, project)) {
    res.status(403).json({ error: "Only the instructor of this class can do this." });
    return;
  }
  const markId = idParam.safeParse(req.params.markId);
  if (!markId.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const mark = await prisma.requirementMark.findFirst({ where: { id: markId.data, projectId: project.id, role: "LEADER" } });
  if (!mark) { res.status(404).json({ error: "Mark not found." }); return; }
  await prisma.requirementMark.update({ where: { id: mark.id }, data: { status: "LEADER_CLAIM_DECLINED" } });
  res.json({ ok: true });
});

async function openMark(req: Request, res: Response, write: boolean): Promise<{ project: LoadedGroup; mark: Mark } | null> {
  const project = await openGroup(req, res, req.params.id);
  if (!project) return null;
  const markId = idParam.safeParse(req.params.markId);
  if (!markId.success) { res.status(400).json({ error: "Invalid id" }); return null; }
  const mark = await prisma.requirementMark.findFirst({ where: { id: markId.data, projectId: project.id } });
  if (!mark) { res.status(404).json({ error: "Mark not found." }); return null; }
  // Who marked it may change it; the owning instructor may remove any mark.
  if (write && mark.markedById !== req.user!.sub && !owningInstructor(req, project)) {
    res.status(403).json({ error: "Only the person who marked this, or the instructor, can change it." });
    return null;
  }
  return { project, mark };
}

// DELETE .../requirement-marks/:markId - one-tap undo.
requirementMarksRouter.delete("/api/groups/:id/requirement-marks/:markId", requireAuth, async (req, res) => {
  const ctx = await openMark(req, res, true);
  if (!ctx) return;
  await prisma.requirementMark.delete({ where: { id: ctx.mark.id } });
  res.json({ ok: true });
});

// PUT .../requirement-marks/:markId/image - raw JPEG/PNG/WebP body (the picture is shrunk in the browser).
// Only the person who marked it. One picture per mark; sending another replaces it.
requirementMarksRouter.put("/api/groups/:id/requirement-marks/:markId/image", requireAuth, async (req, res) => {
  const ctx = await openMark(req, res, true);
  if (!ctx) return;
  if (ctx.mark.markedById !== req.user!.sub) {
    res.status(403).json({ error: "Only the person who marked this can add a picture." });
    return;
  }
  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Send a JPEG, PNG or WebP picture." });
    return;
  }
  const mime = sniffBriefMime(body);
  if (!mime || mime === "application/pdf") {
    res.status(400).json({ error: "Only JPEG, PNG or WebP pictures are accepted." });
    return;
  }
  if (body.length > MARK_IMAGE_MAX_BYTES) {
    res.status(413).json({ error: "That picture is too large (max 1 MB)." });
    return;
  }
  await prisma.requirementMark.update({ where: { id: ctx.mark.id }, data: { imageData: Uint8Array.from(body), imageMime: mime } });
  res.json({ ok: true });
});

// DELETE .../requirement-marks/:markId/image - remove the picture only.
requirementMarksRouter.delete("/api/groups/:id/requirement-marks/:markId/image", requireAuth, async (req, res) => {
  const ctx = await openMark(req, res, true);
  if (!ctx) return;
  await prisma.requirementMark.update({ where: { id: ctx.mark.id }, data: { imageData: null, imageMime: null } });
  res.json({ ok: true });
});

// GET .../requirement-marks/:markId/image - members of the group and the owning instructor only.
requirementMarksRouter.get("/api/groups/:id/requirement-marks/:markId/image", requireAuth, async (req, res) => {
  const ctx = await openMark(req, res, false);
  if (!ctx) return;
  const { mark } = ctx;
  if (!mark.imageData || !mark.imageMime) { res.status(404).json({ error: "No picture." }); return; }
  res.setHeader("Content-Type", mark.imageMime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Cache-Control", "private, no-cache");
  res.send(Buffer.from(mark.imageData));
});

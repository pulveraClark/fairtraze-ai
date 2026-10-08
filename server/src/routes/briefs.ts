import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { assertOwnsAssignment } from "../lib/ownership.js";
import {
  BRIEF_MAX_IMAGES, BRIEF_MAX_PDFS, BRIEF_IMAGE_MAX_BYTES, BRIEF_PDF_MAX_BYTES,
  sniffBriefMime, kindForMime, sanitizeFilename, canViewBrief, attachmentMetaFor,
} from "../lib/briefAttachments.js";

export const briefsRouter = Router();

// Outer bound for the raw parser registered in app.ts; per-kind limits are enforced below.
export const BRIEF_RAW_LIMIT = "6mb";
export const BRIEF_RAW_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

// Reject a body-too-large from express.raw as a clean 413 instead of a stack trace.
export function briefBodyErrors(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if ((err as { type?: string })?.type === "entity.too.large") {
    res.status(413).json({ error: "File is too large (images max 1 MB, PDF max 5 MB)." });
    return;
  }
  next(err);
}

const idParam = z.coerce.number().int().positive();

// POST /api/assignments/:id/attachments?filename=… — raw JPEG/PNG/WebP/PDF body.
briefsRouter.post("/api/assignments/:id/attachments", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }
  const assignment = await assertOwnsAssignment(req, res, idResult.data);
  if (!assignment) return;

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Send a JPEG, PNG or WebP image, or a PDF." });
    return;
  }
  const mime = sniffBriefMime(body);
  if (!mime) {
    res.status(400).json({ error: "Only JPEG, PNG or WebP images and PDF files are accepted." });
    return;
  }
  const kind = kindForMime(mime);
  if (kind === "IMAGE" && body.length > BRIEF_IMAGE_MAX_BYTES) {
    res.status(413).json({ error: "Image is too large (max 1 MB)." });
    return;
  }
  if (kind === "PDF" && body.length > BRIEF_PDF_MAX_BYTES) {
    res.status(413).json({ error: "PDF is too large (max 5 MB)." });
    return;
  }
  const filename = sanitizeFilename(req.query.filename, kind === "PDF" ? "brief.pdf" : "image");

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectAttachment.findMany({
      where:  { assignmentId: assignment.id },
      select: { kind: true, order: true },
    });
    const same = existing.filter((a) => a.kind === kind).length;
    if (kind === "IMAGE" && same >= BRIEF_MAX_IMAGES) return "full-image" as const;
    if (kind === "PDF" && same >= BRIEF_MAX_PDFS) return "full-pdf" as const;
    const order = existing.reduce((m, a) => Math.max(m, a.order), -1) + 1;
    return tx.projectAttachment.create({
      data: {
        assignmentId: assignment.id, kind, mime, filename, order,
        size: body.length, data: new Uint8Array(body),
      },
      select: { id: true, kind: true, mime: true, filename: true, size: true, order: true },
    });
  });

  if (result === "full-image") {
    res.status(409).json({ error: `A project can have at most ${BRIEF_MAX_IMAGES} images.` });
    return;
  }
  if (result === "full-pdf") {
    res.status(409).json({ error: "A project can have only one PDF. Remove the existing one first." });
    return;
  }
  res.status(201).json(result);
});

// PUT /api/assignments/:id/attachments/order — reorder the images.
briefsRouter.put("/api/assignments/:id/attachments/order", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  const parsed = z.object({ ids: z.array(z.number().int().positive()) }).safeParse(req.body);
  if (!idResult.success || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const assignment = await assertOwnsAssignment(req, res, idResult.data);
  if (!assignment) return;

  const images = await prisma.projectAttachment.findMany({
    where:  { assignmentId: assignment.id, kind: "IMAGE" },
    select: { id: true },
  });
  const ids = parsed.data.ids;
  const current = new Set(images.map((i) => i.id));
  if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((i) => current.has(i))) {
    res.status(400).json({ error: "ids must list every current image exactly once." });
    return;
  }
  await prisma.$transaction(ids.map((id, order) =>
    prisma.projectAttachment.update({ where: { id }, data: { order } })
  ));
  res.json({ ok: true });
});

// DELETE /api/assignments/:id/attachments/:attId
briefsRouter.delete("/api/assignments/:id/attachments/:attId", ...requireRole("INSTRUCTOR"), async (req, res) => {
  const idResult  = idParam.safeParse(req.params.id);
  const attResult = idParam.safeParse(req.params.attId);
  if (!idResult.success || !attResult.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const assignment = await assertOwnsAssignment(req, res, idResult.data);
  if (!assignment) return;

  const { count } = await prisma.projectAttachment.deleteMany({
    where: { id: attResult.data, assignmentId: assignment.id },
  });
  if (count === 0) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }
  res.json({ ok: true });
});

const readRoles = requireRole("INSTRUCTOR", "ADMIN", "STUDENT");

// GET /api/assignments/:id/attachments — metadata only.
briefsRouter.get("/api/assignments/:id/attachments", ...readRoles, async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid assignment id" });
    return;
  }
  const access = await canViewBrief(req.user!, idResult.data);
  if (access === "not-found") { res.status(404).json({ error: "Assignment not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "You do not have access to this brief." }); return; }
  const map = await attachmentMetaFor([idResult.data]);
  res.json({ attachments: map.get(idResult.data) ?? [] });
});

// GET /api/assignments/:id/attachments/:attId[?download=1] — authenticated bytes, cacheable.
briefsRouter.get("/api/assignments/:id/attachments/:attId", ...readRoles, async (req, res) => {
  const idResult  = idParam.safeParse(req.params.id);
  const attResult = idParam.safeParse(req.params.attId);
  if (!idResult.success || !attResult.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const access = await canViewBrief(req.user!, idResult.data);
  if (access === "not-found") { res.status(404).json({ error: "Assignment not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "You do not have access to this brief." }); return; }

  const att = await prisma.projectAttachment.findFirst({
    where: { id: attResult.data, assignmentId: idResult.data },
  });
  if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }

  const etag = `"att-${att.id}-${att.size}-${att.createdAt.getTime()}"`;
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (att.kind === "PDF") {
    const safe = sanitizeFilename(att.filename, "brief.pdf");
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    res.setHeader("Content-Disposition", `${disposition}; filename="${safe}"`);
    res.setHeader("Content-Security-Policy", "sandbox");
  }
  if (req.headers["if-none-match"] === etag) {
    res.status(304).end();
    return;
  }
  res.setHeader("Content-Type", att.mime);
  res.send(Buffer.from(att.data));
});

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, isInstructorOf } from "./groups.js";
import { isMemberOf } from "./documents.js";

// Comments are pure metadata about a document — never document content itself. Every route here
// is a plain prisma.comment.* call; none of them touch getYDoc(), ydoc.transact(), or any Yjs
// room. A comment's anchor (an encoded Yjs RelativePosition / CollaborationMappablePosition,
// opaque to the server) is resolved to a live position entirely client-side. This file has no
// dependency on server/src/collab/* and is never read by shared/src/scoring.ts.

export const commentsRouter = Router();

const idParam = z.coerce.number().int().positive();

// Never upserts — a group's Document row only exists once DocumentGate's picker has been used
// (see server/src/routes/documents.ts POST /document/init). Comments must never silently create
// one, or they'd defeat that "document not started yet" gate for the rest of the app.
async function loadGroupAndDocument(projectId: number) {
  const project = await loadGroup(projectId);
  if (!project) return { project: null, document: null };
  const document = await prisma.document.findUnique({ where: { groupId: projectId } });
  return { project, document };
}

function serializeComment(c: {
  id: number; documentId: number; authorId: number; text: string; anchor: Uint8Array;
  parentId: number | null; resolvedAt: Date | null; createdAt: Date;
  author: { id: number; name: string };
}) {
  return {
    id:         c.id,
    documentId: c.documentId,
    author:     { id: c.author.id, name: c.author.name },
    text:       c.text,
    anchor:     Buffer.from(c.anchor).toString("base64"),
    parentId:   c.parentId,
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
    createdAt:  c.createdAt.toISOString(),
  };
}

// GET /api/groups/:id/document/comments — list all comments (root + replies) for the group's
// document. Readable by group members and the class instructor, mirroring GET /document.
commentsRouter.get("/api/groups/:id/document/comments", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const projectId = idResult.data;

  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  if (!isMemberOf(req, project) && !isInstructorOf(req, project)) {
    res.status(403).json({ error: "You do not have access to this document." });
    return;
  }

  const document = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!document) {
    res.json({ comments: [] });
    return;
  }

  const comments = await prisma.comment.findMany({
    where:   { documentId: document.id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });

  res.json({ comments: comments.map(serializeComment) });
});

const postBody = z.object({
  text:     z.string().trim().min(1, "Comment text is required").max(2000, "Comment must be under 2000 characters"),
  anchor:   z.string().min(1, "anchor is required"), // base64-encoded, opaque to the server
  parentId: idParam.optional(),
});

// POST /api/groups/:id/document/comments — any group member may add a comment (self-attributed,
// same rule as PATCH /document and .docx import — comments are about the document, not a
// structural decision like picking a starting template, so this is not leader-gated).
commentsRouter.post("/api/groups/:id/document/comments", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const projectId = idResult.data;

  const bodyResult = postBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: bodyResult.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  if (!isMemberOf(req, project)) {
    res.status(403).json({ error: "Only group members can comment on this document." });
    return;
  }

  if (project.assignment?.sourceType !== "EDITOR" && project.assignment?.sourceType !== "COMBINED") {
    res.status(403).json({ error: "Comments are only available for EDITOR or COMBINED assignments." });
    return;
  }

  const { text, anchor, parentId } = bodyResult.data;

  let anchorBuffer: Uint8Array<ArrayBuffer>;
  try {
    anchorBuffer = Uint8Array.from(Buffer.from(anchor, "base64"));
    if (anchorBuffer.length === 0) throw new Error("empty");
  } catch {
    res.status(400).json({ error: "anchor must be valid base64." });
    return;
  }

  // Deliberately does NOT upsert (unlike GET /document) — a comment can only attach to a
  // document that already exists, i.e. one the leader/instructor has already started via
  // DocumentGate's picker. Silently creating one here would defeat that "not started yet" gate.
  const document = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!document) {
    res.status(404).json({ error: "This group hasn't started their document yet." });
    return;
  }

  if (parentId !== undefined) {
    const parent = await prisma.comment.findUnique({ where: { id: parentId } });
    if (!parent || parent.documentId !== document.id) {
      res.status(400).json({ error: "parentId must reference an existing comment on this document." });
      return;
    }
    if (parent.parentId !== null) {
      res.status(400).json({ error: "Replies can only be added to a root comment, not to another reply." });
      return;
    }
  }

  const created = await prisma.comment.create({
    data: {
      documentId: document.id,
      authorId:   req.user!.sub,
      text,
      anchor:     anchorBuffer,
      parentId:   parentId ?? null,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  res.status(201).json(serializeComment(created));
});

// PATCH /api/groups/:id/document/comments/:commentId/resolve — toggle resolved/open. Any group
// member or the instructor may resolve or reopen a thread — this is collaborative housekeeping,
// not an edit to someone else's words, so it is not author-restricted.
commentsRouter.patch(
  "/api/groups/:id/document/comments/:commentId/resolve",
  requireAuth,
  async (req: Request, res: Response) => {
    const idResult        = idParam.safeParse(req.params.id);
    const commentIdResult = idParam.safeParse(req.params.commentId);
    if (!idResult.success || !commentIdResult.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const bodyResult = z.object({ resolved: z.boolean() }).safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: "resolved must be a boolean" });
      return;
    }

    const { project, document } = await loadGroupAndDocument(idResult.data);
    if (!project) {
      res.status(404).json({ error: "Group not found." });
      return;
    }
    if (!isMemberOf(req, project) && !isInstructorOf(req, project)) {
      res.status(403).json({ error: "You do not have access to this document." });
      return;
    }

    const comment = await prisma.comment.findUnique({ where: { id: commentIdResult.data } });
    if (!document || !comment || comment.documentId !== document.id) {
      res.status(404).json({ error: "Comment not found." });
      return;
    }

    const updated = await prisma.comment.update({
      where: { id: comment.id },
      data:  { resolvedAt: bodyResult.data.resolved ? new Date() : null },
      include: { author: { select: { id: true, name: true } } },
    });

    res.json(serializeComment(updated));
  }
);

// DELETE /api/groups/:id/document/comments/:commentId — author or instructor only. Cascade
// deletes any replies (schema onDelete: Cascade), so there's no separate "orphan reply" state.
commentsRouter.delete(
  "/api/groups/:id/document/comments/:commentId",
  requireAuth,
  async (req: Request, res: Response) => {
    const idResult        = idParam.safeParse(req.params.id);
    const commentIdResult = idParam.safeParse(req.params.commentId);
    if (!idResult.success || !commentIdResult.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const { project, document } = await loadGroupAndDocument(idResult.data);
    if (!project) {
      res.status(404).json({ error: "Group not found." });
      return;
    }

    const comment = await prisma.comment.findUnique({ where: { id: commentIdResult.data } });
    if (!document || !comment || comment.documentId !== document.id) {
      res.status(404).json({ error: "Comment not found." });
      return;
    }

    const isAuthor = comment.authorId === req.user!.sub;
    if (!isAuthor && !isInstructorOf(req, project)) {
      res.status(403).json({ error: "Only the comment's author or the instructor can delete it." });
      return;
    }

    await prisma.comment.delete({ where: { id: comment.id } });

    res.json({ message: "Comment deleted." });
  }
);

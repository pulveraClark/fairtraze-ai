import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, isInstructorOf, leaderMembership } from "./groups.js";
import { computeAuthorshipMap } from "../collab/authorshipMap.js";
import { parseDocxToChunks, importDocxIntoRoom, DocxImportPartialFailureError } from "../collab/docxImport.js";
import { findDocumentTemplate } from "@shared/documentTemplates.js";

export const documentsRouter = Router();

const idParam = z.coerce.number().int().positive();

// Minimal shape check — accepts any ProseMirror/TipTap doc without hand-modeling
// every node/mark type. Rejects garbage payloads (wrong type, missing root).
const contentBody = z.object({
  content: z.object({ type: z.literal("doc") }).passthrough(),
});

export function isMemberOf(
  req: Request,
  project: NonNullable<Awaited<ReturnType<typeof loadGroup>>>
): boolean {
  return project.groupMemberships.some((m) => m.userId === req.user!.sub);
}

// GET /api/groups/:id/document — fetch (creating if missing) the group's document.
// Readable by group members and the class instructor. Read-only for the instructor.
documentsRouter.get("/api/groups/:id/document", requireAuth, async (req: Request, res: Response) => {
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

  const doc = await prisma.document.upsert({
    where:  { groupId: projectId },
    update: {},
    create: { groupId: projectId },
  });

  res.json({
    content:   JSON.parse(doc.content) as unknown,
    updatedAt: doc.updatedAt.toISOString(),
  });
});

// GET /api/groups/:id/document/status — whether a Document row exists yet, WITHOUT creating one
// (unlike GET /document above, which auto-creates on first fetch). The client must call this
// before ever calling GET /document or mounting the live editor, so the leader still has a chance
// to pick a starting template — see POST /document/init below.
documentsRouter.get("/api/groups/:id/document/status", requireAuth, async (req: Request, res: Response) => {
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

  const doc = await prisma.document.findUnique({ where: { groupId: projectId } });
  res.json({ exists: !!doc });
});

const initBody = z.object({
  templateId: z.string().min(1).optional(),
});

// POST /api/groups/:id/document/init — create the group's Document row, optionally seeded from a
// template (see shared/src/documentTemplates.ts). Leader or instructor only — this is a
// structural choice for the whole group, unlike the self-attributed PATCH/import routes below.
//
// This never touches the live Yjs room: it only sets the Document.content column at row-creation
// time. persistence.ts's bindState() migrates that JSON into the Y.Doc, with no origin, the first
// time the room is ever bound — the same no-attribution path that already makes today's default
// empty document invisible to scoring. So template boilerplate can never produce an
// EditEvent/EditSession row or count toward any member's score.
//
// The upsert's `update: {}` makes this idempotent: if a Document row already exists (created by
// this route, by the auto-creating GET /document, or by a concurrent call), this is a no-op and
// never overwrites existing content — `created: false` tells the caller its choice didn't apply.
documentsRouter.post("/api/groups/:id/document/init", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const projectId = idResult.data;

  const bodyResult = initBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "templateId, if provided, must be a non-empty string." });
    return;
  }

  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  if (!isInstructorOf(req, project) && !leaderMembership(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can start the document." });
    return;
  }

  if (project.assignment?.sourceType !== "EDITOR" && project.assignment?.sourceType !== "COMBINED") {
    res.status(403).json({ error: "Document creation is only available for EDITOR or COMBINED assignments." });
    return;
  }

  let content: string | undefined;
  if (bodyResult.data.templateId) {
    const template = findDocumentTemplate(bodyResult.data.templateId);
    if (!template) {
      res.status(400).json({ error: "Unknown templateId." });
      return;
    }
    content = JSON.stringify(template.content);
  }

  const existing = await prisma.document.findUnique({ where: { groupId: projectId } });
  const doc = await prisma.document.upsert({
    where:  { groupId: projectId },
    update: {},
    create: content !== undefined ? { groupId: projectId, content } : { groupId: projectId },
  });

  res.json({
    created:   !existing,
    content:   JSON.parse(doc.content) as unknown,
    updatedAt: doc.updatedAt.toISOString(),
  });
});

// PATCH /api/groups/:id/document — save document content.
// Members only — the instructor is read-only for this step.
documentsRouter.patch("/api/groups/:id/document", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const projectId = idResult.data;

  const bodyResult = contentBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "content must be a TipTap/ProseMirror document object." });
    return;
  }

  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  if (!isMemberOf(req, project)) {
    res.status(403).json({ error: "Only group members can edit this document." });
    return;
  }

  const contentJson = JSON.stringify(bodyResult.data.content);

  const doc = await prisma.document.upsert({
    where:  { groupId: projectId },
    update: { content: contentJson },
    create: { groupId: projectId, content: contentJson },
  });

  res.json({ updatedAt: doc.updatedAt.toISOString() });
});

// GET /api/groups/:id/document/authorship — net-character-authorship map (Step 3: capture &
// visualization only, not scoring). Readable by group members and the class instructor.
// EDITOR/COMBINED groups only, mirroring the sourceType gate already used for the "document"
// tab in ProjectDetailPage.tsx / StudentGroupPage.tsx.
documentsRouter.get("/api/groups/:id/document/authorship", requireAuth, async (req: Request, res: Response) => {
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

  if (project.assignment?.sourceType !== "EDITOR" && project.assignment?.sourceType !== "COMBINED") {
    res.status(403).json({ error: "Authorship data is only available for EDITOR or COMBINED assignments." });
    return;
  }

  const doc = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!doc) {
    res.json({ spans: [], users: [] });
    return;
  }

  const map = await computeAuthorshipMap(doc.id);
  res.json(map);
});

const importBody = z.object({
  filename: z.string().min(1),
  fileBase64: z.string().min(1),
});

// 5MB raw file cap, matching the client-side pre-check in DocumentEditor.tsx. The route-scoped
// express.json({limit:"8mb"}) registered in app.ts (before the app-wide 100kb default) is the
// hard backstop for the base64-inflated JSON body; this is the second, independent check against
// the decoded byte count — never trust the client-side check alone.
const MAX_DOCX_BYTES = 5 * 1024 * 1024;

// POST /api/groups/:id/document/import — .docx import (docx-import step 4). Any group member may
// import content for THEMSELVES only (self-attributed, same rule as PATCH /document) into the
// group's live collaborative document. See server/src/collab/docxImport.ts for how this reaches
// the same live Y.Doc a connected WebSocket client would sync to.
documentsRouter.post("/api/groups/:id/document/import", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const projectId = idResult.data;

  const bodyResult = importBody.safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "filename and fileBase64 are required." });
    return;
  }
  const { filename, fileBase64 } = bodyResult.data;

  if (!/\.docx$/i.test(filename)) {
    res.status(400).json({ error: "Only .docx files are supported." });
    return;
  }

  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  if (!isMemberOf(req, project)) {
    res.status(403).json({ error: "Only group members can import a document." });
    return;
  }

  if (project.assignment?.sourceType !== "EDITOR" && project.assignment?.sourceType !== "COMBINED") {
    res.status(403).json({ error: "Document import is only available for EDITOR or COMBINED assignments." });
    return;
  }

  const buffer = Buffer.from(fileBase64, "base64");

  if (buffer.length === 0) {
    res.status(400).json({ error: "This document appears to be empty — nothing to import." });
    return;
  }
  if (buffer.length > MAX_DOCX_BYTES) {
    res.status(413).json({ error: `File is too large — the limit is ${MAX_DOCX_BYTES / (1024 * 1024)}MB.` });
    return;
  }

  let chunks;
  try {
    chunks = await parseDocxToChunks(buffer);
  } catch (err) {
    console.error(`[documents] docx parse failed for group ${projectId}`, err);
    res.status(400).json({ error: "This file could not be read as a valid .docx document." });
    return;
  }

  if (chunks.length === 0) {
    res.status(400).json({ error: "This document appears to be empty — nothing to import." });
    return;
  }

  try {
    const result = await importDocxIntoRoom(projectId, req.user!.sub, chunks);
    res.json({ chunkCount: result.chunkCount });
  } catch (err) {
    if (err instanceof DocxImportPartialFailureError) {
      console.error(`[documents] partial docx import failure for group ${projectId}`, err.cause);
      res.status(500).json({
        error: `Import failed after ${err.importedCount} of ${err.totalCount} section(s) were already added to the document — check the document, as some content may already be visible even though the import did not complete.`,
      });
      return;
    }
    console.error(`[documents] docx import failed for group ${projectId}`, err);
    res.status(500).json({ error: "Import failed unexpectedly." });
  }
});

import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { docs } from "y-websocket/bin/utils";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, isInstructorOf, leaderMembership } from "./groups.js";
import { computeAuthorshipMap } from "../collab/authorshipMap.js";
import { parseDocxToChunks, importDocxIntoRoom, DocxImportPartialFailureError } from "../collab/docxImport.js";
import { readDocumentStructure, buildDocxBuffer, type ExportComment } from "../collab/documentExport.js";
import { cancelPendingPersist } from "../collab/persistence.js";
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

// A document is safely resettable (the leader can pick a different starting template) only when
// NO real user-authored content exists yet on it: no live-typed/imported EditEvent, no EditSession
// (which also covers image-only inserts — those never produce an EditEvent but do touch a
// session), and no Comment. Comments matter here even though they're never scored: a member can
// select template-only text and comment on it with zero typing, so EditEvent/EditSession alone
// would under-detect "real content exists" and a reset would silently cascade-delete that
// discussion. Recomputed fresh on every call — never cached, never trusted from the client.
async function isDocumentResettable(documentId: number): Promise<boolean> {
  const [editEventCount, editSessionCount, commentCount] = await Promise.all([
    prisma.editEvent.count({ where: { documentId } }),
    prisma.editSession.count({ where: { documentId } }),
    prisma.comment.count({ where: { documentId } }),
  ]);
  return editEventCount === 0 && editSessionCount === 0 && commentCount === 0;
}

// GET /api/groups/:id/document/status — whether a Document row exists yet, WITHOUT creating one
// (unlike GET /document above, which auto-creates on first fetch). The client must call this
// before ever calling GET /document or mounting the live editor, so the leader still has a chance
// to pick a starting template — see POST /document/init below. Also reports `resettable`, which
// gates the client's "Change template" affordance — see POST /document/reset below.
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
  const resettable = doc ? await isDocumentResettable(doc.id) : false;
  res.json({ exists: !!doc, resettable });
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

// POST /api/groups/:id/document/reset — undo a misclicked template choice. Leader or instructor
// only (same check as /document/init). Only succeeds while the document is still genuinely
// untouched — see isDocumentResettable above — re-verified here server-side regardless of what
// the client believed, since the "Change template" affordance being visible at all only reflects
// the state of a prior /status call, which can go stale (another tab, another member typing in
// the meantime).
documentsRouter.post("/api/groups/:id/document/reset", requireAuth, async (req: Request, res: Response) => {
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

  if (!isInstructorOf(req, project) && !leaderMembership(req, project)) {
    res.status(403).json({ error: "Only the group leader or instructor can change the template." });
    return;
  }

  const doc = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!doc) {
    res.status(404).json({ error: "This group hasn't started their document yet." });
    return;
  }

  if (!(await isDocumentResettable(doc.id))) {
    res.status(409).json({ error: "This document already has real content — it can no longer be reset." });
    return;
  }

  // Only touch the live room if one is ALREADY resident (someone has the editor open, or it was
  // left resident by the documented room-eviction limitation) — checked via y-websocket's own
  // `docs` map, never via getYDoc(room, true). getYDoc would itself CREATE a room here if none
  // existed, which calls persistence.bindState() fire-and-forget (never awaited by getYDoc, the
  // same pattern documented elsewhere in this codebase) — and bindState's own
  // attachAuthorshipTracking() does its own unconditional Document.upsert() shortly after. That
  // upsert races the prisma.document.delete() below and can resurrect the row we just deleted,
  // completely independent of the persist-debounce race handled below. Only ever acting on an
  // ALREADY-resident room sidesteps this entirely: attachAuthorshipTracking only ever runs once,
  // when a room is first created, so a room resident before this request already has it behind it.
  const room = `group-doc-${projectId}`;
  const liveYdoc = docs.get(room);
  if (liveYdoc) {
    // Clears with no transact origin, mirroring persistence.ts's own origin-less legacy-content
    // migration, so authorshipCapture.ts's update listener correctly ignores it (no stray
    // EditEvent from a clear nobody "wrote").
    const fragment = liveYdoc.getXmlFragment("default");
    liveYdoc.transact(() => {
      fragment.delete(0, fragment.length);
    });

    // The clear above may have just scheduled a debounced persist for this room (bindState's own
    // ydoc.on("update", ...) listener) — and one could already have been pending from whatever
    // made this room resident in the first place. Cancel it before deleting the row below —
    // otherwise that persist fires ~3s from now and silently recreates an empty Document row,
    // which would make a template the leader picks in that window silently no-op (POST
    // /document/init's upsert sees an "existing" row and never applies the new content).
    cancelPendingPersist(room);
  }

  await prisma.document.delete({ where: { groupId: projectId } });

  res.json({ reset: true });
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

// GET /api/groups/:id/document/export — download the document's current content as a file.
// Read-then-convert only: readDocumentStructure builds a scratch, never-registered Y.Doc from
// Document.yjsState (falling back to legacy Document.content) and never calls getYDoc() — so this
// has zero interaction with authorshipCapture.ts or the live collab room. Readable by group
// members and the class instructor, mirroring GET /document.
documentsRouter.get("/api/groups/:id/document/export", requireAuth, async (req: Request, res: Response) => {
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
    res.status(403).json({ error: "Document export is only available for EDITOR or COMBINED assignments." });
    return;
  }

  const format = typeof req.query.format === "string" ? req.query.format : "docx";
  if (format !== "docx") {
    res.status(400).json({ error: "Unsupported export format — only 'docx' is available." });
    return;
  }

  const doc = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!doc) {
    res.status(404).json({ error: "This group hasn't started their document yet." });
    return;
  }

  const commentRows = await prisma.comment.findMany({
    where:   { documentId: doc.id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true } } },
  });
  const commentsById = new Map(commentRows.map((c) => [c.id, c]));
  const comments: ExportComment[] = commentRows.map((c) => ({
    author:       c.author.name,
    text:         c.text,
    resolved:     !!c.resolvedAt,
    createdAt:    c.createdAt.toISOString(),
    parentAuthor: c.parentId ? commentsById.get(c.parentId)?.author.name : undefined,
  }));

  let buffer: Buffer;
  try {
    const blocks = readDocumentStructure({ content: doc.content, yjsState: doc.yjsState });
    buffer = await buildDocxBuffer(blocks, comments);
  } catch (err) {
    console.error(`[documents] export failed for group ${projectId}`, err);
    res.status(500).json({ error: "Export failed unexpectedly." });
    return;
  }

  const safeName = (project.groupName || `group-${projectId}`).replace(/[^a-z0-9-_ ]/gi, "").trim() || `group-${projectId}`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.docx"`);
  res.send(buffer);
});

// GET /api/groups/:id/document/snapshots — list the group's document revision history, newest
// first. Snapshots are written by server/src/routes/analyze.ts on every analysis run (see
// DocumentSnapshot in schema.prisma) — this route only reads them. No document row yet is a
// valid, expected state (not an error), mirroring the authorship-map route's empty-state shape
// rather than export's 404-for-missing-file shape.
documentsRouter.get("/api/groups/:id/document/snapshots", requireAuth, async (req: Request, res: Response) => {
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
    res.status(403).json({ error: "Document history is only available for EDITOR or COMBINED assignments." });
    return;
  }

  const doc = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!doc) {
    res.json({ snapshots: [] });
    return;
  }

  const snapshots = await prisma.documentSnapshot.findMany({
    where:   { documentId: doc.id },
    orderBy: { createdAt: "desc" },
    select:  { id: true, createdAt: true, reportId: true },
  });
  res.json({ snapshots });
});

// GET /api/groups/:id/document/snapshots/:snapshotId — reconstruct one historical snapshot's
// content via readDocumentStructure, unmodified — the exact same scratch-Y.Doc read pattern
// export already uses. Read-only; never touches the live Y.Doc or authorshipCapture.ts.
documentsRouter.get("/api/groups/:id/document/snapshots/:snapshotId", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  const snapshotIdResult = idParam.safeParse(req.params.snapshotId);
  if (!idResult.success || !snapshotIdResult.success) {
    res.status(400).json({ error: "Invalid group or snapshot id" });
    return;
  }
  const projectId = idResult.data;
  const snapshotId = snapshotIdResult.data;

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
    res.status(403).json({ error: "Document history is only available for EDITOR or COMBINED assignments." });
    return;
  }

  const doc = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!doc) {
    res.status(404).json({ error: "This group hasn't started their document yet." });
    return;
  }

  const snapshot = await prisma.documentSnapshot.findUnique({ where: { id: snapshotId } });
  // A snapshot that doesn't exist and a snapshot that belongs to a different group's document are
  // deliberately indistinguishable here — both 404, never 403 — so this endpoint can't be used as
  // an oracle to confirm another group's snapshot exists.
  if (!snapshot || snapshot.documentId !== doc.id) {
    res.status(404).json({ error: "Snapshot not found." });
    return;
  }

  try {
    const blocks = readDocumentStructure({ content: "", yjsState: snapshot.yjsState });
    res.json({ id: snapshot.id, createdAt: snapshot.createdAt, reportId: snapshot.reportId, blocks });
  } catch (err) {
    console.error(`[documents] snapshot reconstruction failed for group ${projectId}, snapshot ${snapshotId}`, err);
    res.status(500).json({ error: "Failed to reconstruct this snapshot." });
  }
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

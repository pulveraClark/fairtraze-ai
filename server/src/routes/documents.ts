import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { docs } from "y-websocket/bin/utils";
import { prisma } from "../lib/prisma.js";
import { documentHasPreFixEvents, getAuthorshipFixAt } from "../lib/authorshipFix.js";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, isInstructorOf, leaderMembership } from "./groups.js";
import { computeAuthorshipMap } from "../collab/authorshipMap.js";
import { parseDocxToChunks, importDocxIntoRoom, DocxImportPartialFailureError } from "../collab/docxImport.js";
import { readDocumentStructure, buildDocxBuffer, type ExportComment } from "../collab/documentExport.js";
import { extractHeadings } from "../lib/documentHeadings.js";
import { cancelPendingPersist } from "../collab/persistence.js";
import { findDocumentTemplate } from "@shared/documentTemplates.js";
import {
  DEFAULT_MARGIN_PRESET,
  DEFAULT_PAGE_ORIENTATION,
  DEFAULT_PAGE_SIZE,
  HF_SLOT_MAX_CHARS,
  MARGIN_PRESET_KEYS,
  PAGE_ORIENTATIONS,
  PAGE_SIZE_KEYS,
  isMarginPreset,
  isPageOrientation,
  isPageSizeKey,
  resolveMargins,
  sanitizeHeaderFooterText,
  validateMargins,
} from "@shared/pageSizes.js";
import type { MarginPresetKey, MarginsIn, PageOrientation, PageSizeKey } from "@shared/pageSizes.js";
import type { Document as DocumentRow } from "@prisma/client";
import type { DocLayout } from "../collab/documentExport.js";

export const documentsRouter = Router();

const idParam = z.coerce.number().int().positive();

// Minimal shape check — accepts any ProseMirror/TipTap doc without hand-modeling
// every node/mark type. Rejects garbage payloads (wrong type, missing root).
const contentBody = z.object({
  content: z.object({ type: z.literal("doc") }).passthrough(),
});

type PageSetupRow = Pick<
  DocumentRow,
  | "pageSize" | "orientation" | "marginPreset"
  | "marginTop" | "marginBottom" | "marginLeft" | "marginRight"
  | "headerLeft" | "headerCenter" | "headerRight"
  | "footerLeft" | "footerCenter" | "footerRight"
>;
const PAGE_SETUP_SELECT = {
  pageSize: true, orientation: true, marginPreset: true,
  marginTop: true, marginBottom: true, marginLeft: true, marginRight: true,
  headerLeft: true, headerCenter: true, headerRight: true,
  footerLeft: true, footerCenter: true, footerRight: true,
} as const;

/** The document's page setup as the API returns it; stored values are re-validated on the way out. */
export function pageSetupOf(row: PageSetupRow | null): DocLayout {
  const marginPreset: MarginPresetKey = row && isMarginPreset(row.marginPreset) ? row.marginPreset : DEFAULT_MARGIN_PRESET;
  // The stored numbers are the effective margins (presets write their own); a preset's own values
  // win if the row ever disagrees, so a stale column can never show a wrong "Normal".
  const stored: MarginsIn | null = row
    ? { top: row.marginTop, bottom: row.marginBottom, left: row.marginLeft, right: row.marginRight }
    : null;
  return {
    pageSize: row && isPageSizeKey(row.pageSize) ? row.pageSize : DEFAULT_PAGE_SIZE,
    orientation: row && isPageOrientation(row.orientation) ? row.orientation : DEFAULT_PAGE_ORIENTATION,
    marginPreset,
    margins: resolveMargins(marginPreset, stored),
    header: { left: row?.headerLeft ?? "", center: row?.headerCenter ?? "", right: row?.headerRight ?? "" },
    footer: { left: row?.footerLeft ?? "", center: row?.footerCenter ?? "", right: row?.footerRight ?? "" },
  };
}

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
    pageSize:  isPageSizeKey(doc.pageSize) ? doc.pageSize : DEFAULT_PAGE_SIZE,
    pageSetup: pageSetupOf(doc),
  });
});

// GET /api/groups/:id/document/page-size — just the paper size, for cheap polling so a size change
// made by one collaborator reaches the others without touching the collab sockets. Read-only and
// never creates a Document row (no row yet = the default).
documentsRouter.get("/api/groups/:id/document/page-size", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroup(idResult.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!isMemberOf(req, project) && !isInstructorOf(req, project)) {
    res.status(403).json({ error: "You do not have access to this document." });
    return;
  }
  const doc = await prisma.document.findUnique({ where: { groupId: idResult.data }, select: { pageSize: true } });
  res.json({ pageSize: doc && isPageSizeKey(doc.pageSize) ? doc.pageSize : DEFAULT_PAGE_SIZE });
});

const pageSizeBody = z.object({ pageSize: z.enum(PAGE_SIZE_KEYS) });

/** Validates the page setup as it WILL be after a change (same rules as the dialog). Null when fine. */
function setupError(next: {
  pageSize: PageSizeKey;
  orientation: PageOrientation;
  margins: MarginsIn;
  header: { left: string; center: string; right: string };
  footer: { left: string; center: string; right: string };
}): string | null {
  return validateMargins({
    size: next.pageSize,
    orientation: next.orientation,
    margins: next.margins,
    hasHeader: !!(next.header.left || next.header.center || next.header.right),
    hasFooter: !!(next.footer.left || next.footer.center || next.footer.right),
  });
}

// PATCH /api/groups/:id/document/page-size — set the document's paper size. Any GROUP MEMBER may
// change it (the setting is shared by all collaborators); the instructor's view is read-only.
// Deliberately a plain column write on Document: no Yjs/getYDoc() access, no EditEvent/EditSession,
// no Alert, and no Project.membershipChangedAt/scoringConfigChangedAt bump — page layout can never
// mark an analysis outdated or touch authorship.
documentsRouter.patch("/api/groups/:id/document/page-size", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  const body = pageSizeBody.safeParse(req.body);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "pageSize must be one of: " + PAGE_SIZE_KEYS.join(", ") });
    return;
  }
  const projectId = idResult.data;
  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!isMemberOf(req, project)) {
    res.status(403).json({ error: "Only group members can change the page size." });
    return;
  }
  if (project.assignment?.sourceType !== "EDITOR" && project.assignment?.sourceType !== "COMBINED") {
    res.status(403).json({ error: "Page size is only available for EDITOR or COMBINED assignments." });
    return;
  }
  // Never create the row here: a Document row existing is what makes the client skip the template
  // picker (GET /document/status), so only the editor's own flow may bring it into existence.
  const existing = await prisma.document.findUnique({ where: { groupId: projectId }, select: { id: true, ...PAGE_SETUP_SELECT } });
  if (!existing) {
    res.status(404).json({ error: "This group hasn't started their document yet." });
    return;
  }
  const current = pageSetupOf(existing);
  const err = setupError({ ...current, pageSize: body.data.pageSize });
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const doc = await prisma.document.update({
    where:  { id: existing.id },
    data:   { pageSize: body.data.pageSize },
    select: { pageSize: true },
  });
  res.json({ pageSize: doc.pageSize });
});

// GET /api/groups/:id/document/page-setup — the whole page setup (paper, orientation, margins and the
// header/footer text) in one cheap read, for polling so a change by one collaborator reaches the
// others without touching the collab sockets. Read-only for everyone allowed to see the document and
// never creates a Document row (no row yet = the defaults).
documentsRouter.get("/api/groups/:id/document/page-setup", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroup(idResult.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!isMemberOf(req, project) && !isInstructorOf(req, project)) {
    res.status(403).json({ error: "You do not have access to this document." });
    return;
  }
  const row = await prisma.document.findUnique({ where: { groupId: idResult.data }, select: PAGE_SETUP_SELECT });
  res.json(pageSetupOf(row));
});

// Control characters are stripped first, then the length is checked (never silently truncated).
const hfSlot = z
  .string()
  .transform(sanitizeHeaderFooterText)
  .pipe(z.string().max(HF_SLOT_MAX_CHARS, `Each header/footer box holds at most ${HF_SLOT_MAX_CHARS} characters.`));
const hfBand = z.object({ left: hfSlot.optional(), center: hfSlot.optional(), right: hfSlot.optional() }).strict();

// Margins are inches. Range and step are enforced by validateMargins (one source of truth shared
// with the dialog) so the error message is the one the user already saw.
const marginNum = z.number().finite();

const pageSetupBody = z
  .object({
    pageSize: z.enum(PAGE_SIZE_KEYS).optional(),
    orientation: z.enum(PAGE_ORIENTATIONS).optional(),
    marginPreset: z.enum(MARGIN_PRESET_KEYS).optional(),
    marginTop: marginNum.optional(),
    marginBottom: marginNum.optional(),
    marginLeft: marginNum.optional(),
    marginRight: marginNum.optional(),
    header: hfBand.optional(),
    footer: hfBand.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Send at least one setting to change." });

// PATCH /api/groups/:id/document/page-setup — change any subset of the page setup (a header/footer
// object may name any subset of left/center/right; the rest is kept). Same rules as page-size: any
// GROUP MEMBER may change it, the instructor's view is read-only, EDITOR/COMBINED assignments only,
// and the Document row is never created here. A plain column write: no Yjs/getYDoc() access, no
// EditEvent/EditSession, no Alert, no membershipChangedAt/scoringConfigChangedAt bump - page layout
// can never mark an analysis outdated or touch authorship.
documentsRouter.patch("/api/groups/:id/document/page-setup", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const body = pageSetupBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid page setup." });
    return;
  }
  const projectId = idResult.data;
  const project = await loadGroup(projectId);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!isMemberOf(req, project)) {
    res.status(403).json({ error: "Only group members can change the page setup." });
    return;
  }
  if (project.assignment?.sourceType !== "EDITOR" && project.assignment?.sourceType !== "COMBINED") {
    res.status(403).json({ error: "Page setup is only available for EDITOR or COMBINED assignments." });
    return;
  }
  const existing = await prisma.document.findUnique({ where: { groupId: projectId }, select: { id: true, ...PAGE_SETUP_SELECT } });
  if (!existing) {
    res.status(404).json({ error: "This group hasn't started their document yet." });
    return;
  }
  const b = body.data;

  // Margins. A named preset writes its own four numbers (any numbers sent with it are ignored).
  // CUSTOM, or numbers sent without a preset, mean CUSTOM: the numbers sent replace the stored ones
  // one by one. Everything is validated as the final result, so a change that makes the page too
  // small (orientation, header/footer, paper) is refused with the dialog's own message.
  const current = pageSetupOf(existing);
  const sentNumbers = [b.marginTop, b.marginBottom, b.marginLeft, b.marginRight].some((v) => v !== undefined);
  let marginPreset: MarginPresetKey = current.marginPreset;
  let margins: MarginsIn = current.margins;
  if (b.marginPreset !== undefined && b.marginPreset !== "CUSTOM") {
    marginPreset = b.marginPreset;
    margins = resolveMargins(marginPreset);
  } else if (b.marginPreset === "CUSTOM" || sentNumbers) {
    marginPreset = "CUSTOM";
    margins = {
      top: b.marginTop ?? current.margins.top,
      bottom: b.marginBottom ?? current.margins.bottom,
      left: b.marginLeft ?? current.margins.left,
      right: b.marginRight ?? current.margins.right,
    };
  }
  const next = {
    pageSize: b.pageSize ?? current.pageSize,
    orientation: b.orientation ?? current.orientation,
    margins,
    header: { left: b.header?.left ?? current.header.left, center: b.header?.center ?? current.header.center, right: b.header?.right ?? current.header.right },
    footer: { left: b.footer?.left ?? current.footer.left, center: b.footer?.center ?? current.footer.center, right: b.footer?.right ?? current.footer.right },
  };
  const err = setupError(next);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const marginsChanged = b.marginPreset !== undefined || sentNumbers;

  const doc = await prisma.document.update({
    where: { id: existing.id },
    data: {
      ...(b.pageSize !== undefined ? { pageSize: b.pageSize } : {}),
      ...(b.orientation !== undefined ? { orientation: b.orientation } : {}),
      ...(marginsChanged
        ? { marginPreset, marginTop: margins.top, marginBottom: margins.bottom, marginLeft: margins.left, marginRight: margins.right }
        : {}),
      ...(b.header?.left !== undefined ? { headerLeft: b.header.left } : {}),
      ...(b.header?.center !== undefined ? { headerCenter: b.header.center } : {}),
      ...(b.header?.right !== undefined ? { headerRight: b.header.right } : {}),
      ...(b.footer?.left !== undefined ? { footerLeft: b.footer.left } : {}),
      ...(b.footer?.center !== undefined ? { footerCenter: b.footer.center } : {}),
      ...(b.footer?.right !== undefined ? { footerRight: b.footer.right } : {}),
    },
    select: PAGE_SETUP_SELECT,
  });
  res.json(pageSetupOf(doc));
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
    res.json({ spans: [], users: [], docsDataApproximate: false });
    return;
  }

  const map = await computeAuthorshipMap(doc.id);
  res.json({
    ...map,
    docsDataApproximate: await documentHasPreFixEvents(doc.id),
    docsDataFixedAt: getAuthorshipFixAt().toISOString(),
  });
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
    buffer = await buildDocxBuffer(blocks, comments, pageSetupOf(doc));
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

// GET /api/groups/:id/document/headings — H1/H2 heading texts in order, for the Tasks "linked
// heading" picker. Strictly read-only: decodes the persisted Document.yjsState into a scratch doc
// (lib/documentHeadings.ts); never creates the Document row, never calls getYDoc(), writes nothing.
// Readable by group members, the owning instructor and admins (like the document itself).
documentsRouter.get("/api/groups/:id/document/headings", requireAuth, async (req: Request, res: Response) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroup(idResult.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!isMemberOf(req, project) && !isInstructorOf(req, project) && req.user!.role !== "ADMIN") {
    res.status(403).json({ error: "You do not have access to this document." });
    return;
  }
  const sourceType = project.assignment?.sourceType;
  const doc = sourceType === "EDITOR" || sourceType === "COMBINED"
    ? await prisma.document.findUnique({ where: { groupId: project.id }, select: { content: true, yjsState: true } })
    : null;
  let headings: ReturnType<typeof extractHeadings> = [];
  if (doc) {
    try {
      headings = extractHeadings(doc);
    } catch (err) {
      console.error(`[documents] heading extraction failed for group ${project.id}`, err);
    }
  }
  res.set("Cache-Control", "private, no-cache");
  res.json({ headings });
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

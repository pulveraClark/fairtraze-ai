import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { loadGroup, isInstructorOf } from "./groups.js";
import { computeAuthorshipMap } from "../collab/authorshipMap.js";

export const documentsRouter = Router();

const idParam = z.coerce.number().int().positive();

// Minimal shape check — accepts any ProseMirror/TipTap doc without hand-modeling
// every node/mark type. Rejects garbage payloads (wrong type, missing root).
const contentBody = z.object({
  content: z.object({ type: z.literal("doc") }).passthrough(),
});

function isMemberOf(
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

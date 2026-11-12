import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { LATEST_REPORT_ORDER } from "../lib/latestReport.js";
import { buildEvidenceDto } from "../lib/evidenceReport.js";

export const evidenceReportRouter = Router();

// GET /api/groups/:id/evidence-report
// The one-page Contribution Evidence Report for a group: every member's recorded share and flags
// from the LATEST stored analysis, plus the Report ID of that analysis (made once, then reused).
// Members of the group and the instructor who OWNS the class may read it. Admins are not included:
// they manage accounts, never class content. Nothing is recomputed, and the DTO has no Gini,
// bands, team health, thresholds, AI text, usernames, emails or commit/line counts.
evidenceReportRouter.get(
  "/api/groups/:id/evidence-report",
  ...requireRole("STUDENT", "INSTRUCTOR"),
  async (req, res) => {
    const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!idResult.success) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }
    const projectId = idResult.data;
    const userId = req.user!.sub;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        assignment: { select: { classSection: { select: { instructorId: true } } } },
        groupMemberships: { where: { userId }, select: { id: true } },
      },
    });
    if (!project) {
      res.status(404).json({ error: "Group not found." });
      return;
    }

    const isMember = project.groupMemberships.length > 0;
    const isOwner = req.user!.role === "INSTRUCTOR"
      && project.assignment?.classSection.instructorId === userId;
    if (!isMember && !isOwner) {
      res.status(403).json({ error: "You do not have access to this report." });
      return;
    }

    const latest = await prisma.report.findFirst({
      where: { projectId },
      orderBy: [...LATEST_REPORT_ORDER],
      select: { id: true, generatedAt: true, content: true },
    });
    const dto = latest ? await buildEvidenceDto(projectId, latest) : null;
    if (!dto) {
      res.status(404).json({ error: "No analysis yet.", code: "NO_ANALYSIS" });
      return;
    }

    res.set("Cache-Control", "private, no-store");
    res.json(dto);
  },
);

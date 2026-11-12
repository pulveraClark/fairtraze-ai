import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { LATEST_REPORT_ORDER } from "../lib/latestReport.js";
import { buildEvidenceDto } from "../lib/evidenceReport.js";
import {
  REPORT_ID_NOT_FOUND, REPORT_ID_PATTERN, normalizeReportIdInput, type EvidenceVerifyResult,
} from "@shared/evidenceReport.js";

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

// POST /api/evidence-reports/verify  { code }
// The instructor who OWNS the class types the Report ID from a student's printout. The answer is the
// same per-member numbers as the printout plus whether that analysis is still the latest. An unknown
// code and a code belonging to someone else's class both answer the same 404, so the endpoint never
// confirms that another instructor's ID exists. The code travels in the body, not the URL. Rate
// limited (evidenceVerifyLimiter). Admins are not included. No Gini, bands or team health.
evidenceReportRouter.post(
  "/api/evidence-reports/verify",
  ...requireRole("INSTRUCTOR"),
  async (req, res) => {
    const body = z.object({ code: z.string().max(40) }).safeParse(req.body);
    const code = body.success ? normalizeReportIdInput(body.data.code) : "";
    const notFound = () => res.status(404).json({ error: REPORT_ID_NOT_FOUND });
    if (!REPORT_ID_PATTERN.test(code)) { notFound(); return; }

    const row = await prisma.reportEvidenceId.findUnique({
      where: { code },
      select: {
        projectId: true,
        report: { select: { id: true, generatedAt: true, content: true } },
        project: { select: { assignment: { select: { classSection: { select: { instructorId: true } } } } } },
      },
    });
    if (!row || row.project.assignment?.classSection.instructorId !== req.user!.sub) { notFound(); return; }

    const dto = await buildEvidenceDto(row.projectId, row.report);
    if (!dto) { notFound(); return; }

    // "Latest" is the same definition every other page uses; an old ID keeps working as "older".
    const latest = await prisma.report.findFirst({
      where: { projectId: row.projectId },
      orderBy: [...LATEST_REPORT_ORDER],
      select: { id: true },
    });
    const result: EvidenceVerifyResult = {
      status: latest?.id === row.report.id ? "latest" : "older",
      groupName: dto.groupName,
      projectTitle: dto.projectTitle,
      analyzedAt: dto.analyzedAt,
      sourceType: dto.sourceType,
      weights: dto.weights,
      members: dto.members,
    };
    res.set("Cache-Control", "private, no-store");
    res.json(result);
  },
);

import { Router } from "express";
import { z } from "zod";
import { loadGroup } from "../lib/groupAccess.js";
import { resolveTaskActor, canViewBoard } from "../lib/taskPermissions.js";
import { refreshReportIfStale } from "../lib/autoAnalysis.js";
import { requireAuth } from "../middleware/auth.js";

export const refreshReportRouter = Router();

// POST /api/groups/:id/refresh-report
// Called once when a report page opens. Whether anything runs is decided on the server from the
// stored report and the clock (see refreshReportIfStale); the body is ignored, so nobody can force a
// run. Members, the owning instructor and admins may ask; the answer is the same for all of them.
refreshReportRouter.post("/api/groups/:id/refresh-report", requireAuth, async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  const project = await loadGroup(id.data);
  if (!project) {
    res.status(404).json({ error: "Group not found." });
    return;
  }
  if (!canViewBoard(resolveTaskActor(req.user!, project))) {
    res.status(403).json({ error: "You do not have access to this group." });
    return;
  }
  const decision = await refreshReportIfStale(id.data);
  res.status(decision.refreshing ? 202 : 200).json({ refreshing: decision.refreshing });
});

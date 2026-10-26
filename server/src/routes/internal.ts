import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { internalLimiter } from "../middleware/security.js";
import { startAutoAnalysisInBackground } from "../lib/autoAnalysis.js";

// Endpoints for the platform's own scheduler, not for people. Authenticated by a shared secret in
// the CRON_SECRET environment variable, never by a user session.
export const internalRouter = Router();

// Both sides are hashed first so the comparison is constant-time whatever the lengths are.
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// POST /api/internal/analyze-due   header: x-cron-secret
// Answers 202 at once and analyzes every due group in the background (see runAutoAnalysis). Called by
// .github/workflows/nightly-analysis.yml; safe to call again, a run already in progress is not doubled.
internalRouter.post("/api/internal/analyze-due", internalLimiter, (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    res.status(503).json({ error: "Automatic analysis is not configured." });
    return;
  }
  const header = req.headers["x-cron-secret"];
  const provided = typeof header === "string" ? header : "";
  if (!provided || !secretMatches(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { started } = startAutoAnalysisInBackground();
  res.status(202).json({ accepted: true, running: !started });
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { generateFairnessNarrative } from "../lib/gemini.js";
import { aiFailureOf, plainAiFailure } from "../lib/aiFailureText.js";
import { logReadability } from "../lib/aiReview/readability.js";
import { runAnalysis, type ProgressEmitter } from "../lib/analysisRunner.js";
import type { Request, Response } from "express";
import type { TeamReport } from "@shared/types.js";
import { LATEST_REPORT_ORDER } from "../lib/latestReport.js";

export const analyzeRouter = Router();

// ── Optional progress stream (SSE) ────────────────────────────────────────────
// A client that sends `Accept: text/event-stream` (or ?stream=1) gets stage events while the
// analysis runs, then a final `done` event carrying the same AnalyzeResponse the plain JSON path
// returns. Every other client gets exactly the previous single JSON response: finish() falls
// through to res.status(...).json(...) and emit() is a no-op.
//
// Event payloads are built from literal fields only (counts, display names, YYYY-MM-DD day
// buckets) — never spread from a report or member object — so no score, flag, Gini or
// team-health value can appear before `done`.
//
// If compression() middleware is ever added to app.ts, it must skip text/event-stream responses
// (the no-transform header below only stops well-behaved intermediaries).

const KEEP_ALIVE_MS = 10_000;

function createProgressEmitter(req: Request, res: Response): ProgressEmitter {
  const stream = (req.headers.accept ?? "").includes("text/event-stream") || req.query.stream === "1";
  let opened = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const write = (chunk: string) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(chunk);
    (res as Response & { flush?: () => void }).flush?.();
  };
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };

  return {
    stream,
    get opened() { return opened; },
    open() {
      if (!stream || opened) return;
      opened = true;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      timer = setInterval(() => write(": keep-alive\n\n"), KEEP_ALIVE_MS);
      timer.unref();
      res.on("close", stop);
    },
    emit(event, data) {
      if (!opened) return;
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    finish(status, body) {
      if (!stream) {
        res.status(status).json(body);
        return;
      }
      this.open();
      if (status === 200) write(`event: done\ndata: ${JSON.stringify(body)}\n\n`);
      else write(`event: error\ndata: ${JSON.stringify({ status, ...body })}\n\n`);
      stop();
      if (!res.writableEnded) res.end();
    },
  };
}

// ── POST /api/projects/:id/analyze ───────────────────────────────────────────
// Fetches GitHub activity, computes scores, saves/updates the Report row.
// Does NOT call Gemini. Returns any previously saved narrative but never
// generates a new one — use the /narrative endpoint for that.

analyzeRouter.post("/api/projects/:id/analyze", ...requireRole("INSTRUCTOR"), requireVerifiedEmail, async (req, res) => {
  const progress = createProgressEmitter(req, res);
  try {
    await runAnalyze(req, res, progress);
  } catch (err) {
    // Plain JSON clients: rethrow so Express's error handler responds exactly as before.
    // Once the stream is open, headers are already sent, so report the failure as an event.
    if (!progress.opened) throw err;
    console.error(err);
    progress.finish(500, { error: err instanceof Error ? err.message : "Internal server error" });
  }
});

async function runAnalyze(req: Request, res: Response, progress: ProgressEmitter): Promise<void> {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const result = await runAnalysis(idResult.data, { progress, actorInstructorId: req.user!.sub, trigger: "manual" });
  // Errors found before the stream opened stay plain JSON, as before.
  if (!result.streamed) res.status(result.status).json(result.body);
}

// ── POST /api/projects/:id/narrative ─────────────────────────────────────────
// Generates (or returns cached) the AI narrative for the project's latest report.
// Query: ?regenerate=true  — forces a fresh Gemini call even if one is saved.

analyzeRouter.post("/api/projects/:id/narrative", ...requireRole("INSTRUCTOR"), requireVerifiedEmail, async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }
  const projectId = idResult.data;

  const regenerate =
    req.query.regenerate === "true" || (req.body as Record<string, unknown>)?.regenerate === true;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assignment: { select: { description: true, classSection: { select: { instructorId: true } } } } },
  });
  if (!project) {
    res.status(404).json({ error: `Project ${projectId} not found` });
    return;
  }

  // Ownership: the instructor must own the class. A project with no assignment has no owner.
  if (project.assignment?.classSection.instructorId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this project" });
    return;
  }

  const latestReport = await prisma.report.findFirst({
    where: { projectId },
    orderBy: [...LATEST_REPORT_ORDER],
  });
  if (!latestReport) {
    res.status(404).json({ error: "No analysis found — run Analyze first." });
    return;
  }

  const stored = latestReport.content
    ? (JSON.parse(latestReport.content) as { report?: TeamReport; narrative?: string })
    : {};

  // Return cached narrative if present and not regenerating
  if (stored.narrative && !regenerate) {
    res.json({ narrative: stored.narrative, cached: true });
    return;
  }

  if (!stored.report) {
    res.status(500).json({ error: "Stored report data is missing — re-run Analyze." });
    return;
  }

  // Generate via Gemini
  try {
    const narrative = await generateFairnessNarrative(
      project.groupName || `Group ${projectId}`,
      stored.report,
      project.assignment?.description ?? null // context only; never affects scores
    );
    logReadability(`score explanation (group ${projectId})`, [narrative]); // log only
    await prisma.report.update({
      where: { id: latestReport.id },
      data: { content: JSON.stringify({ ...stored, narrative, narrativeOutdated: undefined }) },
    });
    res.json({ narrative, cached: false });
  } catch (err) {
    console.error("[Gemini] narrative generation failed:", err);
    // Only these plain sentences leave the server, never the provider's text.
    const failure = aiFailureOf(err);
    const quota = failure.code === "AI_QUOTA_DAILY";
    const quotaInfo = quota
      ? {
          code: failure.code,
          ...(failure.retryAfterMs ? { retryAt: new Date(Date.now() + failure.retryAfterMs).toISOString() } : {}),
        }
      : {};
    if (stored.narrative) {
      // Degrade gracefully: return saved narrative with a warning
      res.json({
        narrative: stored.narrative,
        cached: true,
        warning: quota ? plainAiFailure(failure.code, failure.retryAfterMs) : "Generation failed; showing previously saved narrative.",
        ...quotaInfo,
      });
    } else {
      res.status(quota ? 429 : 503).json({
        error: plainAiFailure(failure.code, failure.retryAfterMs),
        ...quotaInfo,
      });
    }
  }
});

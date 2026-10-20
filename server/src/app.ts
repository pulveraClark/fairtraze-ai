import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { analyzeRouter } from "./routes/analyze.js";
import { projectsRouter } from "./routes/projects.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { privacyRouter } from "./routes/privacy.js";
import { classesRouter } from "./routes/classes.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { joinRouter } from "./routes/join.js";
import { groupsRouter } from "./routes/groups.js";
import { taskCommitsRouter } from "./routes/taskCommits.js";
import { taskOverviewRouter } from "./routes/taskOverview.js";
import { taskDetailsRouter } from "./routes/taskDetails.js";
import { tasksRouter } from "./routes/tasks.js";
import { documentsRouter } from "./routes/documents.js";
import { commentsRouter } from "./routes/comments.js";
import { alertsRouter } from "./routes/alerts.js";
import { disputesRouter } from "./routes/disputes.js";
import { adminRouter } from "./routes/admin.js";
import { departmentsRouter } from "./routes/departments.js";
import { avatarRouter, avatarBodyErrors } from "./routes/avatar.js";
import { briefsRouter, briefBodyErrors, BRIEF_RAW_LIMIT, BRIEF_RAW_TYPES } from "./routes/briefs.js";
import { authenticateToken } from "./middleware/auth.js";
import {
  corsOptions,
  helmetMiddleware,
  authLimiter,
  trustProxyHops,
  analysisLimiter,
  exportLimiter,
  taskWriteLimiter,
  repoLinkLimiter,
  taskCommentLimiter,
  globalLimiter,
} from "./middleware/security.js";
import { COLLAB_SCHEMA_VERSION } from "@shared/collabVersion.js";

// Builds the Express app without binding a port or attaching the collab
// WebSocket servers — split out from index.ts so tests (supertest) and the
// real server entrypoint can share one app definition.
export function createApp() {
  const app = express();

  // Behind Render's proxy req.ip is the proxy unless told otherwise; see trustProxyHops (security.ts).
  const proxyHops = trustProxyHops();
  if (proxyHops > 0) app.set("trust proxy", proxyHops);

  app.use(helmetMiddleware);
  app.use(cors(corsOptions));
  // .docx import (docx-import step 4) carries a base64-encoded file in its JSON body, well past
  // the 100kb default below. Registered here, before the app-wide express.json(), so it "claims"
  // this one path with a larger limit — body-parser skips re-parsing once req._body is already
  // set, so the global default limit still governs every other route untouched.
  app.use("/api/groups/:id/document/import", express.json({ limit: "8mb" }));
  // Profile photo upload is a raw image body (already client-resized to ~200KB), not JSON.
  app.put("/api/users/me/avatar", express.raw({ type: ["image/jpeg", "image/webp"], limit: "256kb" }));
  app.use("/api/users/me/avatar", avatarBodyErrors);
  // Project brief attachments are raw image/PDF bodies; per-kind size limits are enforced in the route.
  app.post("/api/assignments/:id/attachments", express.raw({ type: BRIEF_RAW_TYPES, limit: BRIEF_RAW_LIMIT }));
  app.use("/api/assignments/:id/attachments", briefBodyErrors);
  // Task attachments: same raw bodies and limits as the brief; per-kind sizes are enforced in the route.
  app.post("/api/groups/:id/tasks/:taskId/attachments", express.raw({ type: BRIEF_RAW_TYPES, limit: BRIEF_RAW_LIMIT }));
  app.use("/api/groups/:id/tasks/:taskId/attachments", briefBodyErrors);
  app.use(express.json());
  app.use(cookieParser());
  // Registered BEFORE the global limiter on purpose: every open editor tab polls it once a minute, and
  // it is a constant, cheap response - a classroom behind one IP must not spend its request budget on it.
  // Public: lets an open editor tab learn that a newer document schema has been deployed, so it can
  // ask the user to reload instead of syncing with a schema the server no longer accepts.
  app.get("/api/version", (_req, res) => {
    res.json({
      collabSchemaVersion: COLLAB_SCHEMA_VERSION,
      build: (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "dev").slice(0, 7),
    });
  });

  app.use(globalLimiter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password"], authLimiter);
  // authenticateToken runs first here so analysisLimiter can key by instructor id
  // (req.user.sub) instead of IP — see the comment on analysisLimiter itself.
  app.use(
    ["/api/projects/:id/analyze", "/api/projects/:id/narrative"],
    authenticateToken,
    analysisLimiter
  );

  app.use("/api/privacy/export", authenticateToken, exportLimiter);
  // Task creation bursts (30/min per user); comments have their own 30/min bucket.
  app.post("/api/groups/:id/tasks", authenticateToken, taskWriteLimiter);
  app.put("/api/groups/:id/repo", authenticateToken, repoLinkLimiter);
  app.post("/api/groups/:id/tasks/:taskId/comments", authenticateToken, taskCommentLimiter);

  app.use(projectsRouter);
  app.use(analyzeRouter);
  app.use(authRouter);
  app.use(usersRouter);
  app.use(privacyRouter);
  app.use(avatarRouter);
  app.use(classesRouter);
  app.use(assignmentsRouter);
  app.use(briefsRouter);
  app.use(joinRouter);
  app.use(groupsRouter);
  app.use(tasksRouter);
  app.use(taskDetailsRouter);
  app.use(taskCommitsRouter);
  app.use(taskOverviewRouter);
  app.use(documentsRouter);
  app.use(commentsRouter);
  app.use(alertsRouter);
  app.use(disputesRouter);
  app.use(adminRouter);
  app.use(departmentsRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ error: err.message ?? "Internal server error" });
    }
  );

  return app;
}

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { analyzeRouter } from "./routes/analyze.js";
import { projectsRouter } from "./routes/projects.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { classesRouter } from "./routes/classes.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { joinRouter } from "./routes/join.js";
import { groupsRouter } from "./routes/groups.js";
import { documentsRouter } from "./routes/documents.js";
import { alertsRouter } from "./routes/alerts.js";
import { disputesRouter } from "./routes/disputes.js";
import { adminRouter } from "./routes/admin.js";
import { departmentsRouter } from "./routes/departments.js";
import {
  corsOptions,
  helmetMiddleware,
  authLimiter,
  analysisLimiter,
  globalLimiter,
} from "./middleware/security.js";

// Builds the Express app without binding a port or attaching the collab
// WebSocket servers — split out from index.ts so tests (supertest) and the
// real server entrypoint can share one app definition.
export function createApp() {
  const app = express();

  app.use(helmetMiddleware);
  app.use(cors(corsOptions));
  // .docx import (docx-import step 4) carries a base64-encoded file in its JSON body, well past
  // the 100kb default below. Registered here, before the app-wide express.json(), so it "claims"
  // this one path with a larger limit — body-parser skips re-parsing once req._body is already
  // set, so the global default limit still governs every other route untouched.
  app.use("/api/groups/:id/document/import", express.json({ limit: "8mb" }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(globalLimiter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use(["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password"], authLimiter);
  app.use(["/api/projects/:id/analyze", "/api/projects/:id/narrative"], analysisLimiter);

  app.use(projectsRouter);
  app.use(analyzeRouter);
  app.use(authRouter);
  app.use(usersRouter);
  app.use(classesRouter);
  app.use(assignmentsRouter);
  app.use(joinRouter);
  app.use(groupsRouter);
  app.use(documentsRouter);
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

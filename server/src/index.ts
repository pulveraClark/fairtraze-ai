import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
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
import { adminRouter }    from "./routes/admin.js";
import { attachYjsCollabServer } from "./collab/yjsServer.js";
import { attachAuthorshipBroadcastServer } from "./collab/authorshipBroadcast.js";
import { closeDanglingSessions, startAuthorshipIdleSweep } from "./collab/authorshipCapture.js";
import {
  corsOptions,
  helmetMiddleware,
  authLimiter,
  analysisLimiter,
  globalLimiter,
} from "./middleware/security.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmetMiddleware);
app.use(cors(corsOptions));
app.use(express.json());
app.use(globalLimiter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(["/api/auth/login", "/api/auth/register"], authLimiter);
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

const httpServer = http.createServer(app);
attachYjsCollabServer(httpServer);
attachAuthorshipBroadcastServer(httpServer);

closeDanglingSessions().catch((err) => console.error("[collab] closeDanglingSessions failed", err));
startAuthorshipIdleSweep();

httpServer.listen(PORT, () => {
  console.log(`FairTraze AI server running on http://localhost:${PORT}`);
});

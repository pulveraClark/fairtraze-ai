import "dotenv/config";
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
import { alertsRouter } from "./routes/alerts.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(projectsRouter);
app.use(analyzeRouter);
app.use(authRouter);
app.use(usersRouter);
app.use(classesRouter);
app.use(assignmentsRouter);
app.use(joinRouter);
app.use(groupsRouter);
app.use(alertsRouter);

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

app.listen(PORT, () => {
  console.log(`FairTraze AI server running on http://localhost:${PORT}`);
});

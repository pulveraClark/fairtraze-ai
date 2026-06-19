import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const projectsRouter = Router();

projectsRouter.get("/api/projects", async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: { members: true },
    orderBy: { id: "asc" },
  });
  res.json({ projects });
});

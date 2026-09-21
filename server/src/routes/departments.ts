import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

export const departmentsRouter = Router();

// GET /api/departments — read-only list for the class-creation dropdown.
// Instructors need this without admin rights; department CRUD itself stays ADMIN-only (admin.ts).
departmentsRouter.get("/api/departments", ...requireRole("INSTRUCTOR", "ADMIN"), async (_req, res) => {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  res.json({ departments });
});

import type { Request, Response } from "express";
import type { ClassSection, Assignment } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * Resolves a ClassSection by id and verifies it belongs to the requesting instructor.
 * Sends 404 or 403 and returns null if the check fails; returns the record if it passes.
 */
export async function assertOwnsClass(
  req: Request,
  res: Response,
  classSectionId: number
): Promise<ClassSection | null> {
  const cls = await prisma.classSection.findUnique({ where: { id: classSectionId } });
  if (!cls) {
    res.status(404).json({ error: "Class section not found" });
    return null;
  }
  // ADMIN may read any class (write routes are guarded by requireRole("INSTRUCTOR") separately)
  if (req.user!.role === "ADMIN" || cls.instructorId === req.user!.sub) {
    return cls;
  }
  res.status(403).json({ error: "You do not have access to this class section" });
  return null;
}

type AssignmentWithClass = Assignment & { classSection: ClassSection };

/**
 * Resolves an Assignment by id (including its ClassSection) and verifies the
 * requesting instructor owns the parent class.
 * Sends 404 or 403 and returns null if the check fails; returns the record if it passes.
 */
export async function assertOwnsAssignment(
  req: Request,
  res: Response,
  assignmentId: number
): Promise<AssignmentWithClass | null> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { classSection: true },
  });
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return null;
  }
  // ADMIN may read any assignment (write routes are guarded by requireRole("INSTRUCTOR") separately)
  if (req.user!.role === "ADMIN" || assignment.classSection.instructorId === req.user!.sub) {
    return assignment;
  }
  res.status(403).json({ error: "You do not have access to this assignment" });
  return null;
}

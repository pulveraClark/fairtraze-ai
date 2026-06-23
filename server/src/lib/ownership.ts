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
  if (cls.instructorId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this class section" });
    return null;
  }
  return cls;
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
  if (assignment.classSection.instructorId !== req.user!.sub) {
    res.status(403).json({ error: "You do not have access to this assignment" });
    return null;
  }
  return assignment;
}

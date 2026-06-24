import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";

export const adminRouter = Router();

const idParam   = z.coerce.number().int().positive();
const roleEnum  = z.enum(["ADMIN", "INSTRUCTOR", "STUDENT"]);

// Safe user select — never returns passwordHash.
const USER_SELECT = {
  id:             true,
  name:           true,
  email:          true,
  systemRole:     true,
  githubUsername: true,
  active:         true,
  createdAt:      true,
} as const;

// Fetch the requesting actor's display name for audit entries.
async function getActorName(actorId: number): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return actor?.name ?? `Admin #${actorId}`;
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// List all users with server-side pagination.
// Query params: search, role, page (default 1), pageSize (default 20).

adminRouter.get("/api/admin/users", ...requireRole("ADMIN"), async (req, res) => {
  const search    = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const roleRaw   = typeof req.query.role   === "string" ? req.query.role          : "";
  const roleParsed = roleEnum.safeParse(roleRaw);

  const page     = Math.max(1, parseInt(String(req.query.page     ?? "1"),  10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

  const where = {
    ...(roleParsed.success ? { systemRole: roleParsed.data } : {}),
    ...(search ? {
      OR: [
        { name:  { contains: search } },
        { email: { contains: search } },
      ],
    } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select:  USER_SELECT,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
// Change a user's systemRole. An admin cannot demote their own account.

adminRouter.patch("/api/admin/users/:id/role", ...requireRole("ADMIN"), async (req, res) => {
  const idResult   = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }

  const bodyResult = z.object({ role: roleEnum }).safeParse(req.body);
  if (!bodyResult.success) { res.status(400).json({ error: "Invalid role. Must be ADMIN, INSTRUCTOR, or STUDENT." }); return; }

  const targetId = idResult.data;
  const { role } = bodyResult.data;

  if (targetId === req.user!.sub && role !== "ADMIN") {
    res.status(403).json({ error: "You cannot change your own role. Ask another admin to do it." });
    return;
  }

  const target = await prisma.user.findUnique({
    where:  { id: targetId },
    select: { id: true, name: true, systemRole: true },
  });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const [updated, actorName] = await Promise.all([
    prisma.user.update({ where: { id: targetId }, data: { systemRole: role }, select: USER_SELECT }),
    getActorName(req.user!.sub),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId:    req.user!.sub,
      actorName,
      action:     "ROLE_CHANGED",
      targetType: "USER",
      targetId:   String(targetId),
      details:    `${target.name}: ${target.systemRole} → ${role}`,
    },
  });

  res.json(updated);
});

// ── PATCH /api/admin/users/:id/status ────────────────────────────────────────
// Activate or deactivate a user. An admin cannot deactivate their own account.

adminRouter.patch("/api/admin/users/:id/status", ...requireRole("ADMIN"), async (req, res) => {
  const idResult   = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }

  const bodyResult = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!bodyResult.success) { res.status(400).json({ error: "active must be a boolean" }); return; }

  const targetId = idResult.data;

  if (targetId === req.user!.sub) {
    res.status(403).json({ error: "You cannot deactivate your own account." });
    return;
  }

  const target = await prisma.user.findUnique({
    where:  { id: targetId },
    select: { id: true, name: true },
  });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const [updated, actorName] = await Promise.all([
    prisma.user.update({ where: { id: targetId }, data: { active: bodyResult.data.active }, select: USER_SELECT }),
    getActorName(req.user!.sub),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId:    req.user!.sub,
      actorName,
      action:     bodyResult.data.active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      targetType: "USER",
      targetId:   String(targetId),
      details:    target.name,
    },
  });

  res.json(updated);
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
// Permanently delete a user and all directly associated data.
// An admin cannot delete their own account.

adminRouter.delete("/api/admin/users/:id", ...requireRole("ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }

  const targetId = idResult.data;

  if (targetId === req.user!.sub) {
    res.status(403).json({ error: "You cannot delete your own account." });
    return;
  }

  const [target, actorName] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId }, select: { id: true, name: true, email: true } }),
    getActorName(req.user!.sub),
  ]);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Manual cascade in the correct FK order so no RESTRICT constraint fires.
  // AuditLog entries where this user is the actor have actorId nulled (onDelete: SetNull on schema),
  // but we do it explicitly here to be safe with SQLite FK enforcement.
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId:    req.user!.sub,
        actorName,
        action:     "USER_DELETED",
        targetType: "USER",
        targetId:   String(targetId),
        details:    `${target.name} (${target.email})`,
      },
    });
    await tx.auditLog.updateMany({ where: { actorId: targetId }, data: { actorId: null } });
    await tx.dispute.deleteMany({ where: { studentUserId: targetId } });
    await tx.alert.deleteMany({ where: { instructorId: targetId } });
    await tx.groupMembership.deleteMany({ where: { userId: targetId } });
    await tx.classSection.deleteMany({ where: { instructorId: targetId } });
    await tx.user.delete({ where: { id: targetId } });
  });

  res.json({ message: `User "${target.name}" deleted.` });
});

// ── GET /api/admin/overview ───────────────────────────────────────────────────
// Institution-wide aggregates from stored DB data only. No GitHub/Gemini calls.

adminRouter.get("/api/admin/overview", ...requireRole("ADMIN"), async (_req, res) => {
  const [roleCounts, classSectionCount, openDisputesCount, projects] = await Promise.all([
    prisma.user.groupBy({ by: ["systemRole"], _count: { id: true } }),
    prisma.classSection.count(),
    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.project.findMany({
      select: {
        id:              true,
        groupName:       true,
        assignmentLabel: true,
        assignmentId:    true,
        reports: {
          select:  { gini: true, teamHealth: true, content: true, generatedAt: true },
          orderBy: { generatedAt: "desc" },
          take:    1,
        },
        assignment: {
          select: {
            classSection: {
              select: {
                subjectCode: true,
                edpCode:     true,
                subjectName: true,
                instructor:  { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const users = { total: 0, admins: 0, instructors: 0, students: 0 };
  for (const rc of roleCounts) {
    users.total += rc._count.id;
    if (rc.systemRole === "ADMIN")      users.admins      = rc._count.id;
    if (rc.systemRole === "INSTRUCTOR") users.instructors = rc._count.id;
    if (rc.systemRole === "STUDENT")    users.students    = rc._count.id;
  }

  const totalProjects = projects.length;
  const totalGroups   = projects.filter((p) => p.assignmentId !== null).length;
  let   analyzedGroups = 0;

  const healthDist = { healthy: 0, moderateRisk: 0, highRisk: 0 };
  const flagTotals = { inactive: 0, freeRider: 0, overload: 0, deadlineDriven: 0 };

  interface AtRiskGroup {
    projectId:      number;
    groupName:      string;
    classDisplay:   string;
    subjectName:    string;
    instructorName: string;
    teamHealth:     string;
    gini:           number | null;
    analyzedAt:     Date;
  }

  const atRiskGroups: AtRiskGroup[] = [];

  for (const project of projects) {
    const report = project.reports[0];
    if (!report) continue;
    analyzedGroups++;

    if      (report.teamHealth === "Healthy")       healthDist.healthy++;
    else if (report.teamHealth === "Moderate Risk") healthDist.moderateRisk++;
    else if (report.teamHealth === "High Risk")     healthDist.highRisk++;

    let hasFlags = false;
    if (report.content) {
      try {
        const parsed = JSON.parse(report.content) as { members?: Array<{ flags?: string[] }> };
        for (const member of parsed.members ?? []) {
          for (const flag of member.flags ?? []) {
            hasFlags = true;
            if      (flag === "inactive")       flagTotals.inactive++;
            else if (flag === "free-rider")     flagTotals.freeRider++;
            else if (flag === "overload")       flagTotals.overload++;
            else if (flag === "deadline-driven") flagTotals.deadlineDriven++;
          }
        }
      } catch { /* malformed content — skip */ }
    }

    if (report.teamHealth === "High Risk" || report.teamHealth === "Moderate Risk" || hasFlags) {
      const cs = project.assignment?.classSection;
      const classDisplay = cs
        ? [cs.subjectCode, cs.edpCode].filter(Boolean).join(" ")
        : project.assignmentLabel.split("—")[0]?.trim() ?? "";

      atRiskGroups.push({
        projectId:      project.id,
        groupName:      project.groupName || `Group ${project.id}`,
        classDisplay,
        subjectName:    cs?.subjectName ?? "",
        instructorName: cs?.instructor?.name ?? "Unknown",
        teamHealth:     report.teamHealth ?? "Unknown",
        gini:           report.gini,
        analyzedAt:     report.generatedAt,
      });
    }
  }

  atRiskGroups.sort((a, b) => b.analyzedAt.getTime() - a.analyzedAt.getTime());

  res.json({
    users,
    classSections:      classSectionCount,
    totalProjects,
    totalGroups,
    analyzedGroups,
    healthDistribution: healthDist,
    flagTotals,
    atRiskGroups,
    openDisputesCount,
  });
});

// ── GET /api/admin/classes ────────────────────────────────────────────────────
// List ALL class sections across all instructors (admin oversight browsing).

adminRouter.get("/api/admin/classes", ...requireRole("ADMIN"), async (_req, res) => {
  const classes = await prisma.classSection.findMany({
    orderBy: [{ instructorId: "asc" }, { createdAt: "asc" }],
    include: {
      instructor:  { select: { id: true, name: true, email: true } },
      assignments: {
        orderBy: { createdAt: "asc" },
        select:  { id: true, title: true, _count: { select: { projects: true } } },
      },
    },
  });

  res.json({ classes });
});

// ── GET /api/admin/audit ──────────────────────────────────────────────────────
// Audit log entries newest-first, paginated. Optional ?action= filter.

adminRouter.get("/api/admin/audit", ...requireRole("ADMIN"), async (req, res) => {
  const action   = typeof req.query.action === "string" && req.query.action ? req.query.action : undefined;
  const page     = Math.max(1, parseInt(String(req.query.page     ?? "1"),  10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

  const where = action ? { action } : undefined;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:         true,
        actorName:  true,
        action:     true,
        targetType: true,
        targetId:   true,
        details:    true,
        createdAt:  true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ entries, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

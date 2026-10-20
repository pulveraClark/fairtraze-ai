import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import { notify, activeAdminIds, resolveNotifications } from "../lib/notify.js";
import { anonymizeUser } from "../lib/anonymizeUser.js";
import { parseAdminUsersFilters, buildUserFilters, buildUserOrderBy } from "../lib/adminUsersQuery.js";

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
  lockedUntil:    true,
  createdAt:      true,
  lastLoginAt:    true,
  deletedAt:      true,
} as const;

// Fetch the requesting actor's display name for audit entries.
async function getActorName(actorId: number): Promise<string> {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return actor?.name ?? `Admin #${actorId}`;
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// List users with server-side pagination.
// Query params: search, role, status (active|inactive), lastActive (7d|30d|never),
// sort (name|joined|lastActive), dir (asc|desc), includeFormer (default false),
// page (default 1), pageSize (default 20). See lib/adminUsersQuery.ts.

adminRouter.get("/api/admin/users", ...requireRole("ADMIN"), async (req, res) => {
  const filters = parseAdminUsersFilters(req.query);

  const page     = Math.max(1, parseInt(String(req.query.page     ?? "1"),  10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "20"), 10) || 20));

  // Former members are anonymized tombstones (User.deletedAt, set by lib/anonymizeUser.ts).
  // Hidden unless includeFormer=true; total and pagination count only what is shown.
  const base  = buildUserFilters(filters);
  const where = filters.includeFormer ? base : { AND: [base, { deletedAt: null }] };

  const [users, total, formerCount] = await Promise.all([
    prisma.user.findMany({
      where,
      select:  USER_SELECT,
      orderBy: buildUserOrderBy(filters),
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.user.count({ where }),
    // For the "Show former members (n)" toggle; same filters, regardless of includeFormer.
    prisma.user.count({ where: { AND: [base, { deletedAt: { not: null } }] } }),
  ]);

  res.json({ users, total, formerCount, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

// ── GET /api/admin/users/:id/details ──────────────────────────────────────────
// Counts only, for the details panel: how many classes the person owns or is enrolled in, and how many
// groups they belong to. No class, group or report content is returned.

adminRouter.get("/api/admin/users/:id/details", ...requireRole("ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }
  const userId = idResult.data;

  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) { res.status(404).json({ error: "User not found" }); return; }

  const [owned, enrolled, groupCount] = await Promise.all([
    prisma.classSection.count({ where: { instructorId: userId } }),
    prisma.classEnrollment.count({ where: { userId } }),
    prisma.groupMembership.count({ where: { userId } }),
  ]);

  res.json({ classCount: owned + enrolled, groupCount });
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

// ── POST /api/admin/users/:id/unlock ──────────────────────────────────────────
// Clear a login lockout (failedLoginAttempts/lockedUntil) before its 15-minute
// auto-expiry — see MAX_FAILED_LOGIN_ATTEMPTS/LOCKOUT_DURATION_MS in auth.ts.

adminRouter.post("/api/admin/users/:id/unlock", ...requireRole("ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }

  const targetId = idResult.data;

  const target = await prisma.user.findUnique({
    where:  { id: targetId },
    select: { id: true, name: true },
  });
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const [updated, actorName] = await Promise.all([
    prisma.user.update({
      where: { id: targetId },
      data:  { failedLoginAttempts: 0, lockedUntil: null },
      select: USER_SELECT,
    }),
    getActorName(req.user!.sub),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId:    req.user!.sub,
      actorName,
      action:     "USER_UNLOCKED",
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
    prisma.user.findUnique({ where: { id: targetId }, select: { id: true, name: true } }),
    getActorName(req.user!.sub),
  ]);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  // Deletion is anonymization (lib/anonymizeUser.ts): the account is scrubbed and kept as a
  // "Former member" tombstone so FK-linked rows and teammates' stored reports stay intact.
  const result = await anonymizeUser(targetId, { actorId: req.user!.sub, actorName, action: "USER_DELETED" });
  if (!result.ok) {
    res.status(result.code === "NOT_FOUND" ? 404 : 409).json({ error: result.message, code: result.code });
    return;
  }

  res.json({ message: `User "${target.name}" deleted.` });
});

// ── Account deletion requests (RA 10173 erasure) ──────────────────────────────
// Users file these from Settings > Privacy (routes/privacy.ts). Approval anonymizes the account.

adminRouter.get("/api/admin/deletion-requests", ...requireRole("ADMIN"), async (_req, res) => {
  const select = {
    id: true, status: true, reason: true, createdAt: true, reviewedAt: true, reviewNote: true,
    user: { select: { id: true, name: true, email: true, systemRole: true } },
  } as const;
  const [pending, recent] = await Promise.all([
    prisma.deletionRequest.findMany({ where: { status: "PENDING" }, select, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.deletionRequest.findMany({ where: { status: { in: ["APPROVED", "REJECTED"] } }, select, orderBy: { reviewedAt: "desc" }, take: 10 }),
  ]);
  res.json({ pendingCount: pending.length, pending, recent });
});

adminRouter.post("/api/admin/deletion-requests/:id/approve", ...requireRole("ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid request id" }); return; }

  const request = await prisma.deletionRequest.findUnique({ where: { id: idResult.data }, select: { id: true, userId: true, status: true } });
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }
  if (request.status !== "PENDING") { res.status(409).json({ error: `This request is already ${request.status.toLowerCase()}.` }); return; }
  if (request.userId === req.user!.sub) { res.status(403).json({ error: "You cannot approve your own deletion." }); return; }

  const actorName = await getActorName(req.user!.sub);
  const result = await anonymizeUser(request.userId, { actorId: req.user!.sub, actorName, action: "ACCOUNT_ERASURE_APPROVED" });
  if (!result.ok) {
    res.status(result.code === "NOT_FOUND" ? 404 : 409).json({ error: result.message, code: result.code });
    return;
  }

  await prisma.deletionRequest.update({
    where: { id: request.id },
    data:  { status: "APPROVED", reviewedAt: new Date(), reviewedById: req.user!.sub },
  });
  await resolveNotifications({ type: "DELETION_REQUESTED", refType: "DELETION_REQUEST", refId: request.id });

  res.json({ id: request.id, status: "APPROVED" });
});

adminRouter.post("/api/admin/deletion-requests/:id/reject", ...requireRole("ADMIN"), async (req, res) => {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid request id" }); return; }
  const note = z.object({ note: z.string().trim().max(500).optional() }).safeParse(req.body ?? {});

  const request = await prisma.deletionRequest.findUnique({ where: { id: idResult.data }, select: { id: true, userId: true } });
  if (!request) { res.status(404).json({ error: "Request not found" }); return; }

  const updated = await prisma.deletionRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data:  { status: "REJECTED", reviewedAt: new Date(), reviewedById: req.user!.sub, reviewNote: note.success ? (note.data.note || null) : null },
  });
  if (updated.count === 0) { res.status(409).json({ error: "This request is no longer pending." }); return; }

  const actorName = await getActorName(req.user!.sub);
  await prisma.auditLog.create({
    data: {
      actorId: req.user!.sub, actorName, action: "ACCOUNT_ERASURE_REJECTED",
      targetType: "USER", targetId: String(request.userId), details: `Deletion request #${request.id} rejected`,
    },
  });
  await resolveNotifications({ type: "DELETION_REQUESTED", refType: "DELETION_REQUEST", refId: request.id });
  await notify({
    recipientIds: request.userId,
    actorId:      req.user!.sub,
    type:         "DELETION_REJECTED",
    message:      "Your account deletion request was not approved. Contact your administrator for details.",
    link:         "/settings",
    refType:      "DELETION_REQUEST",
    refId:        request.id,
  });

  res.json({ id: request.id, status: "REJECTED" });
});

// ── GET /api/admin/overview ───────────────────────────────────────────────────
// Account counts only. The admin's job is accounts and the system: no class, group,
// report or dispute figures are returned here. Former (anonymized) members are not counted.

adminRouter.get("/api/admin/overview", ...requireRole("ADMIN"), async (_req, res) => {
  const [roleCounts, inactive] = await Promise.all([
    prisma.user.groupBy({ by: ["systemRole"], where: { deletedAt: null }, _count: { id: true } }),
    prisma.user.count({ where: { deletedAt: null, active: false } }),
  ]);

  const users = { total: 0, admins: 0, instructors: 0, students: 0, active: 0, inactive };
  for (const rc of roleCounts) {
    users.total += rc._count.id;
    if (rc.systemRole === "ADMIN")      users.admins      = rc._count.id;
    if (rc.systemRole === "INSTRUCTOR") users.instructors = rc._count.id;
    if (rc.systemRole === "STUDENT")    users.students    = rc._count.id;
  }
  users.active = users.total - inactive;

  res.json({ users });
});

// ── GET /api/admin/departments ────────────────────────────────────────────────
// List all departments (institutional taxonomy — pre-created by admins).

adminRouter.get("/api/admin/departments", ...requireRole("ADMIN"), async (_req, res) => {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { classSections: true } } },
  });

  res.json({ departments });
});

// ── POST /api/admin/departments ───────────────────────────────────────────────
// Create a department. Instructors select from this list when creating a class
// section — they cannot create departments themselves (see CLAUDE.md rationale).

adminRouter.post("/api/admin/departments", ...requireRole("ADMIN"), async (req, res) => {
  const bodyResult = z.object({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1),
  }).safeParse(req.body);
  if (!bodyResult.success) {
    res.status(400).json({ error: "Invalid input", details: bodyResult.error.flatten() });
    return;
  }

  const { name, code } = bodyResult.data;

  const [department, actorName] = await Promise.all([
    prisma.department.create({ data: { name, code } }),
    getActorName(req.user!.sub),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId:    req.user!.sub,
      actorName,
      action:     "DEPARTMENT_CREATED",
      targetType: "DEPARTMENT",
      targetId:   String(department.id),
      details:    `${department.name} (${department.code})`,
    },
  });

  await notify({
    recipientIds: activeAdminIds,
    actorId:      req.user!.sub,
    type:         "DEPARTMENT_CREATED",
    message:      `Department created: ${department.name} (${department.code})`,
    link:         "/admin",
  });

  res.status(201).json(department);
});

// ── Instructor approvals ──────────────────────────────────────────────────────
// Self-registered instructors start PENDING (auth.ts register) and are gated out of every
// instructor route by requireRole until an admin approves them here.

const APPROVAL_SELECT = {
  id:                  true,
  name:                true,
  email:               true,
  createdAt:           true,
  instructorStatus:    true,
  approvalReviewedAt:  true,
  approvalReviewedById: true,
} as const;

// GET /api/admin/instructor-approvals — pending queue plus recently reviewed requests.
adminRouter.get("/api/admin/instructor-approvals", ...requireRole("ADMIN"), async (_req, res) => {
  const [pending, reviewed] = await Promise.all([
    prisma.user.findMany({
      where:   { systemRole: "INSTRUCTOR", instructorStatus: "PENDING" },
      select:  APPROVAL_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.user.findMany({
      where:   { systemRole: "INSTRUCTOR", instructorStatus: { not: "PENDING" }, approvalReviewedAt: { not: null } },
      select:  APPROVAL_SELECT,
      orderBy: { approvalReviewedAt: "desc" },
      take:    10,
    }),
  ]);

  const reviewerIds = [...new Set(reviewed.map((u) => u.approvalReviewedById).filter((id): id is number => id !== null))];
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })
    : [];
  const reviewerName = new Map(reviewers.map((r) => [r.id, r.name]));

  res.json({
    pendingCount: pending.length,
    pending: pending.map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })),
    recent: reviewed.map((u) => ({
      id:             u.id,
      name:           u.name,
      email:          u.email,
      status:         u.instructorStatus,
      reviewedAt:     u.approvalReviewedAt,
      reviewedByName: u.approvalReviewedById !== null ? (reviewerName.get(u.approvalReviewedById) ?? null) : null,
    })),
  });
});

// Shared by approve/reject. `from` is the set of statuses the transition is allowed from; the
// guarded updateMany makes it atomic so two admins acting at once can't both "win".
async function reviewInstructor(
  req: Request,
  res: Response,
  decision: "APPROVED" | "REJECTED",
  from: Array<"PENDING" | "REJECTED">,
): Promise<void> {
  const idResult = idParam.safeParse(req.params.id);
  if (!idResult.success) { res.status(400).json({ error: "Invalid user id" }); return; }
  const targetId = idResult.data;

  const target = await prisma.user.findUnique({
    where:  { id: targetId },
    select: { id: true, name: true, systemRole: true, instructorStatus: true },
  });
  if (!target || target.systemRole !== "INSTRUCTOR") {
    res.status(404).json({ error: "Instructor not found" });
    return;
  }

  const updated = await prisma.user.updateMany({
    where: { id: targetId, systemRole: "INSTRUCTOR", instructorStatus: { in: from } },
    data:  { instructorStatus: decision, approvalReviewedAt: new Date(), approvalReviewedById: req.user!.sub },
  });
  if (updated.count === 0) {
    res.status(409).json({ error: `This request is already ${target.instructorStatus.toLowerCase()}.` });
    return;
  }

  const actorName = await getActorName(req.user!.sub);
  const approved  = decision === "APPROVED";

  await prisma.auditLog.create({
    data: {
      actorId:    req.user!.sub,
      actorName,
      action:     approved ? "INSTRUCTOR_APPROVED" : "INSTRUCTOR_REJECTED",
      targetType: "USER",
      targetId:   String(targetId),
      details:    `${target.name}: ${target.instructorStatus} → ${decision}`,
    },
  });

  await notify({
    recipientIds: targetId,
    actorId:      req.user!.sub,
    type:         approved ? "INSTRUCTOR_APPROVED" : "INSTRUCTOR_REJECTED",
    message:      approved
      ? "Your instructor account has been approved. You can now use instructor features."
      : "Your instructor request was not approved. Contact your administrator.",
    link:         "/dashboard",
    refType:      "USER",
    refId:        targetId,
  });

  res.json({ id: targetId, status: decision });
}

adminRouter.post("/api/admin/instructor-approvals/:id/approve", ...requireRole("ADMIN"), (req, res) =>
  reviewInstructor(req, res, "APPROVED", ["PENDING", "REJECTED"]));

adminRouter.post("/api/admin/instructor-approvals/:id/reject", ...requireRole("ADMIN"), (req, res) =>
  reviewInstructor(req, res, "REJECTED", ["PENDING"]));

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

import { studentNarrative } from "../lib/studentNarrative.js";
import { evennessOf } from "../lib/studentEvenness.js";
import { isNarrativeOutdated } from "../lib/narrativeBasis.js";
import { attachmentMetaForClass, attachmentMetaForGroup } from "../lib/briefAttachments.js";
import { latestReportsForStudent } from "../lib/studentLatestReports.js";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { isRulesOutdated } from "@shared/scoringRules.js";
import { reportDataConfidence } from "../lib/reportConfidence.js";
import { groupHasPreFixEvents, getAuthorshipFixAt } from "../lib/authorshipFix.js";
import { requireAuth, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { defaultFunctionalRoles } from "../lib/roles.js";
import { notify } from "../lib/notify.js";
import { removeMemberRowFor } from "../lib/memberSync.js";
import type {
  TeamReport, AnyScoredMember, ScoredMember, DocumentScoredMember, CombinedScoredMember,
} from "@shared/types.js";

import { contentHasNoRecordedActivity, hasNoRecordedActivity, quietSource } from "../lib/reportActivity.js";
import { LATEST_REPORT_ORDER } from "../lib/latestReport.js";
import { autoUpdateFailed } from "../lib/autoAnalysis.js";
import { narrativeForDisplay } from "../lib/currentNamesDb.js";
import { currentPeopleFrom, type CurrentPerson } from "../lib/currentNames.js";

export const joinRouter = Router();

// ─── GET /api/join/class/:code ────────────────────────────────────────────────
// Preview for an invite link: which class the code belongs to and whether the caller is already in it.
// Read-only (never enrolls); any signed-in role may ask, only a student can be "already enrolled".
joinRouter.get("/api/join/class/:code", requireAuth, async (req, res) => {
  const code = String(req.params.code ?? "").trim().toUpperCase();
  const cls = code
    ? await prisma.classSection.findUnique({ where: { joinCode: code }, select: { id: true, subjectCode: true, subjectName: true } })
    : null;
  if (!cls) {
    res.status(404).json({ error: "Invalid join code. Check the code and try again." });
    return;
  }
  const enrollment = await prisma.classEnrollment.findUnique({
    where: { userId_classSectionId: { userId: req.user!.sub, classSectionId: cls.id } },
    select: { id: true },
  });
  res.json({ classId: cls.id, className: `${cls.subjectCode} — ${cls.subjectName}`, alreadyEnrolled: !!enrollment });
});

// ─── POST /api/join/class ──────────────────────────────────────────────────────
// Enroll a student in a class using the class-level join code.
// 404 if code doesn't match; 409 if already enrolled.
joinRouter.post("/api/join/class", ...requireRole("STUDENT"), async (req, res) => {
  const result = z.object({ joinCode: z.string().min(1) }).safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Please enter a join code." });
    return;
  }

  const userId = req.user!.sub;
  const code   = result.data.joinCode.trim().toUpperCase();

  const cls = await prisma.classSection.findUnique({
    where: { joinCode: code },
    select: {
      id: true, subjectCode: true, subjectName: true,
      department: { select: { id: true, name: true, code: true } },
      edpCode: true, joinCode: true,
    },
  });
  if (!cls) {
    res.status(404).json({ error: "Invalid join code. Check the code and try again." });
    return;
  }

  const existing = await prisma.classEnrollment.findUnique({
    where: { userId_classSectionId: { userId, classSectionId: cls.id } },
  });
  if (existing) {
    res.status(409).json({ error: "You are already enrolled in this class." });
    return;
  }

  const enrollment = await prisma.classEnrollment.create({
    data: { userId, classSectionId: cls.id },
  });

  res.status(201).json({
    classSectionId: cls.id,
    subjectCode:    cls.subjectCode,
    subjectName:    cls.subjectName,
    department:     cls.department,
    edpCode:        cls.edpCode,
    joinedAt:       enrollment.joinedAt.toISOString(),
  });
});

// ─── GET /api/student/classes ─────────────────────────────────────────────────
// Return all classes the student is enrolled in, with each assignment and
// the student's group (if any) per assignment.
joinRouter.get("/api/student/classes", ...requireRole("STUDENT"), async (req, res) => {
  const userId = req.user!.sub;

  // Only the fields the mapper below reads. The latest report of each of the student's own groups comes
  // from one separate query (lib/studentLatestReports.ts) running alongside the class tree: nested
  // `reports: { take: 1 }` reads every report of every project first.
  const [enrollments, latestReports] = await Promise.all([
    prisma.classEnrollment.findMany({
      where:   { userId },
      orderBy: { joinedAt: "asc" },
      select: {
        joinedAt: true,
        classSection: {
          select: {
            id: true, subjectCode: true, subjectName: true, edpCode: true, joinCode: true,
            department: { select: { id: true, name: true, code: true } },
            assignments: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true, title: true, deadline: true, sourceType: true, maxGroupSize: true,
                projects: {
                  orderBy: { id: "asc" },
                  select: {
                    id: true, groupName: true, repoUrl: true,
                    groupMemberships: { where: { userId }, take: 1, select: { role: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    latestReportsForStudent(userId),
  ]);

  const classes = enrollments.map((e) => {
    const cs = e.classSection;
    return {
      id:          cs.id,
      subjectCode: cs.subjectCode,
      subjectName: cs.subjectName,
      department:  cs.department,
      edpCode:     cs.edpCode,
      joinCode:    cs.joinCode,
      joinedAt:    e.joinedAt.toISOString(),
      // One entry per assignment — not per group/project
      assignments: cs.assignments.map((a) => {
        // Find the project (group) this student belongs to under this assignment
        const myProject = a.projects.find((p) => p.groupMemberships.length > 0) ?? null;
        const myMembership = myProject?.groupMemberships[0] ?? null;
        const latestReport = myProject ? latestReports.get(myProject.id) : undefined;

        return {
          id:           a.id,
          title:        a.title,
          deadline:     a.deadline?.toISOString() ?? null,
          sourceType:   a.sourceType,
          maxGroupSize: a.maxGroupSize,
          myGroup: myMembership && myProject
            ? {
                id:        myProject.id,
                groupName: myProject.groupName || `Group ${myProject.id}`,
                repoUrl:   myProject.repoUrl,
                role:      myMembership.role,
                report:    latestReport
                  ? {
                      evenness:    evennessOf(latestReport.teamHealth),
                      generatedAt: latestReport.generatedAt.toISOString(),
                      noActivity:  contentHasNoRecordedActivity(latestReport.content),
                    }
                  : null,
              }
            : null,
        };
      }),
    };
  });

  res.json({ classes });
});

// ─── GET /api/student/classes/:id/projects ────────────────────────────────────
// Full drill-down for one class: enrollment required.
// Returns each assignment with the student's group and all joinable groups.
joinRouter.get("/api/student/classes/:id/projects", ...requireRole("STUDENT"), async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid class id" });
    return;
  }

  const userId         = req.user!.sub;
  const classSectionId = idResult.data;

  const enrollment = await prisma.classEnrollment.findUnique({
    where: { userId_classSectionId: { userId, classSectionId } },
  });
  if (!enrollment) {
    res.status(403).json({ error: "You are not enrolled in this class." });
    return;
  }

  // Everything below depends only on (userId, classSectionId), so it runs in one parallel round instead of
  // waiting for the class tree to find project and assignment ids. Relation filters pick the same rows the
  // id lists used to. Only the fields the mapper reads are selected, and the latest report of the student's
  // own groups is one row per project (lib/studentLatestReports.ts), not every report of every group.
  const [cs, myJoinRequests, pendingCountRows, briefMeta, latestReports] = await Promise.all([
    prisma.classSection.findUnique({
      where: { id: classSectionId },
      select: {
        id: true, subjectCode: true, subjectName: true, edpCode: true, joinCode: true,
        department: { select: { id: true, name: true, code: true } },
        assignments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true, title: true, deadline: true, sourceType: true, maxGroupSize: true, description: true,
            projects: {
              orderBy: { id: "asc" },
              select: {
                id: true, groupName: true, repoUrl: true,
                members:          { select: { id: true } },
                groupMemberships: { select: { userId: true, role: true, user: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    // This student's pending/declined requests for any group in this class.
    prisma.groupJoinRequest.findMany({
      where: {
        userId,
        project: { assignment: { classSectionId } },
        status:  { in: ["PENDING", "DECLINED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, createdAt: true,
        project: { select: { id: true, groupName: true, assignmentId: true } },
      },
    }),
    // For groups where this student is LEADER, count incoming pending requests.
    prisma.groupJoinRequest.groupBy({
      by:    ["projectId"],
      where: {
        status:  "PENDING",
        project: { assignment: { classSectionId }, groupMemberships: { some: { userId, role: "LEADER" } } },
      },
      _count: { id: true },
    }),
    attachmentMetaForClass(classSectionId),
    latestReportsForStudent(userId, classSectionId),
  ]);

  if (!cs) {
    res.status(404).json({ error: "Class not found." });
    return;
  }

  const pendingCountByProject = new Map(pendingCountRows.map((r) => [r.projectId, r._count.id]));

  const assignments = cs.assignments.map((a) => {
    const myProject    = a.projects.find((p) => p.groupMemberships.some((m) => m.userId === userId)) ?? null;
    const myMembership = myProject?.groupMemberships.find((m) => m.userId === userId) ?? null;
    const latestReport = myProject ? latestReports.get(myProject.id) : undefined;

    // Most relevant join request for this assignment:
    // PENDING takes priority; fall back to most recent DECLINED (already ordered desc)
    const assignmentProjectIds = new Set(a.projects.map((p) => p.id));
    const relevantRequests     = myJoinRequests.filter((r) => assignmentProjectIds.has(r.project.id));
    const pendingReq           = relevantRequests.find((r) => r.status === "PENDING");
    const latestDeclined       = relevantRequests.find((r) => r.status === "DECLINED");
    const myRequest            = pendingReq ?? latestDeclined ?? null;

    return {
      id:           a.id,
      title:        a.title,
      deadline:     a.deadline?.toISOString() ?? null,
      sourceType:   a.sourceType,
      maxGroupSize: a.maxGroupSize,
      description:  a.description,
      attachments:  briefMeta.get(a.id) ?? [],
      myGroup: myMembership && myProject
        ? {
            id:                   myProject.id,
            groupName:            myProject.groupName || `Group ${myProject.id}`,
            repoUrl:              myProject.repoUrl,
            role:                 myMembership.role,
            pendingRequestCount:  pendingCountByProject.get(myProject.id) ?? 0,
            report:               latestReport
              ? {
                  evenness:    evennessOf(latestReport.teamHealth),
                  generatedAt: latestReport.generatedAt.toISOString(),
                  noActivity:  contentHasNoRecordedActivity(latestReport.content),
                }
              : null,
          }
        : null,
      myRequest: myRequest
        ? {
            id:        myRequest.id,
            projectId: myRequest.project.id,
            groupName: myRequest.project.groupName || `Group ${myRequest.project.id}`,
            status:    myRequest.status as "PENDING" | "DECLINED",
            createdAt: myRequest.createdAt.toISOString(),
          }
        : null,
      // All groups in this assignment (for join UI — only relevant when myGroup is null)
      groups: a.projects.map((p) => {
        const leader = p.groupMemberships.find((m) => m.role === "LEADER");
        return {
          id:          p.id,
          groupName:   p.groupName || `Group ${p.id}`,
          memberCount: p.members.length,
          leaderName:  leader?.user.name ?? null,
          isFull:      p.members.length >= a.maxGroupSize,
        };
      }),
    };
  });

  res.json({
    classSection: {
      id:          cs.id,
      subjectCode: cs.subjectCode,
      subjectName: cs.subjectName,
      department:  cs.department,
      edpCode:     cs.edpCode,
      joinCode:    cs.joinCode,
    },
    assignments,
  });
});

// ─── GET /api/student/requests ────────────────────────────────────────────────
// Student's own join requests across all classes, with current status.
joinRouter.get("/api/student/requests", ...requireRole("STUDENT"), async (req, res) => {
  const userId = req.user!.sub;

  const requests = await prisma.groupJoinRequest.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
    include: {
      project: {
        select: {
          id:       true,
          groupName: true,
          assignment: {
            select: {
              id:    true,
              title: true,
              classSection: { select: { id: true, subjectCode: true, subjectName: true } },
            },
          },
        },
      },
    },
  });

  res.json({
    requests: requests.map((r) => ({
      id:         r.id,
      status:     r.status,
      createdAt:  r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      group: {
        id:        r.project.id,
        groupName: r.project.groupName || `Group ${r.project.id}`,
      },
      assignment: r.project.assignment
        ? {
            id:    r.project.assignment.id,
            title: r.project.assignment.title,
            classSection: r.project.assignment.classSection
              ? {
                  id:          r.project.assignment.classSection.id,
                  subjectCode: r.project.assignment.classSection.subjectCode,
                  subjectName: r.project.assignment.classSection.subjectName,
                }
              : null,
          }
        : null,
    })),
  });
});

// ─── POST /api/join/create-group ─────────────────────────────────────────────
// Student creates a new group for an assignment, becoming the leader.
// Body: { assignmentId, groupName }. A repository is linked afterwards from the group's setup card
// (PUT /api/groups/:id/repo); the creator's GitHub username is likewise added there, not required here.
// Requires enrollment in the assignment's class.
joinRouter.post("/api/join/create-group", ...requireRole("STUDENT"), requireVerifiedEmail, async (req, res) => {
  const result = z.object({
    assignmentId: z.number().int().positive(),
    groupName:    z.string().min(1, "Group name is required"),
  }).safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const userId = req.user!.sub;

  const [user, assignment] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.assignment.findUnique({
      where: { id: result.data.assignmentId },
      select: {
        id: true, title: true, classSectionId: true, sourceType: true, maxGroupSize: true,
        classSection: { select: { instructorId: true } },
      },
    }),
  ]);

  if (!assignment) {
    res.status(404).json({ error: "Assignment not found." });
    return;
  }

  // Verify enrollment in the class
  const enrollment = await prisma.classEnrollment.findUnique({
    where: { userId_classSectionId: { userId, classSectionId: assignment.classSectionId } },
  });
  if (!enrollment) {
    res.status(403).json({ error: "You must be enrolled in this class to create a group." });
    return;
  }

  // One group per student per assignment
  const alreadyIn = await prisma.groupMembership.findFirst({
    where: { userId, project: { assignmentId: assignment.id } },
  });
  if (alreadyIn) {
    res.status(409).json({ error: "You are already in a group for this project." });
    return;
  }

  const trimmedName = result.data.groupName.trim();
  const nameTaken   = await prisma.project.findFirst({
    where: { assignmentId: assignment.id, groupName: trimmedName },
  });
  if (nameTaken) {
    res.status(409).json({ error: "That group name is already taken. Choose a different name." });
    return;
  }

  const project = await prisma.project.create({
    data: {
      groupName:    trimmedName,
      name:         trimmedName, // legacy column, kept in sync with groupName — not surfaced anywhere
      repoUrl:      null, // linked later from the setup card; Docs-only groups never link one
      assignmentId: assignment.id,
    },
  });

  await prisma.groupMembership.create({
    data: {
      userId,
      projectId:       project.id,
      role:            "LEADER",
      functionalRoles: defaultFunctionalRoles(assignment.sourceType),
    },
  });

  await prisma.member.create({
    data: {
      projectId:      project.id,
      studentName:    user!.name,
      githubUsername: user!.githubUsername ?? "",
    },
  });

  await notify({
    recipientIds: assignment.classSection.instructorId,
    actorId:      userId,
    type:         "GROUP_CREATED",
    message:      `New group created: ${project.groupName} (${assignment.title})`,
    link:         `/project/${project.id}`,
    projectId:    project.id,
  });

  res.status(201).json({ id: project.id, groupName: project.groupName, role: "LEADER" });
});

// ─── DELETE /api/student/classes/:classSectionId/leave ───────────────────────
// Student leaves a class. Removes their enrollment and all their group memberships
// within that class's assignments. Sole-member leader groups are disbanded.
// Blocked if they are a leader with other members (must reassign first).
joinRouter.delete("/api/student/classes/:classSectionId/leave", ...requireRole("STUDENT"), async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.classSectionId);
  if (!idResult.success) { res.status(400).json({ error: "Invalid class id" }); return; }

  const userId         = req.user!.sub;
  const classSectionId = idResult.data;

  const [enrollment, user] = await Promise.all([
    prisma.classEnrollment.findUnique({
      where: { userId_classSectionId: { userId, classSectionId } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, githubUsername: true } }),
  ]);

  if (!enrollment) {
    res.status(404).json({ error: "You are not enrolled in this class." });
    return;
  }

  const memberships = await prisma.groupMembership.findMany({
    where: { userId, project: { assignment: { classSectionId } } },
    include: {
      project: {
        select: {
          id: true, groupName: true,
          groupMemberships: { select: { id: true, userId: true } },
        },
      },
    },
  });

  // Block if the student is a leader of any group that still has other members
  for (const mem of memberships) {
    if (mem.role === "LEADER" && mem.project.groupMemberships.length > 1) {
      const name = mem.project.groupName || `Group ${mem.project.id}`;
      res.status(409).json({
        error: `Reassign leadership in "${name}" before leaving this class.`,
      });
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const mem of memberships) {
      if (mem.role === "LEADER" && mem.project.groupMemberships.length <= 1) {
        // Sole member — disband the group (cascade handles everything)
        await tx.project.delete({ where: { id: mem.projectId } });
      } else {
        // Regular member — remove their membership and Member row
        await tx.groupMembership.delete({ where: { id: mem.id } });
        await tx.project.update({
          where: { id: mem.projectId },
          data:  { membershipChangedAt: new Date() },
        });
        if (user) await removeMemberRowFor(tx, mem.projectId, user);
      }
    }
    await tx.classEnrollment.delete({
      where: { userId_classSectionId: { userId, classSectionId } },
    });
  });

  res.json({ message: "Left class." });
});


export interface LeaderTeamMemberView {
  userId: number;
  name: string;
  isLeader: boolean;
  functionalRoles: string[];
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
  contributionShare: number | null;
  githubContributionShare: number | null;
  documentContributionShare: number | null;
  flags: string[];
  tasks: { open: number; done: number };
}

/** Whitelisted per-member view for the group leader. Members absent from the report get null stats. */
export async function buildLeaderTeamView(
  projectId: number,
  reportMembers: AnyScoredMember[],
  sourceType: string,
): Promise<LeaderTeamMemberView[]> {
  return (await loadLeaderTeam(projectId, reportMembers, sourceType)).team;
}

/** Same read as above; also returns the members' current names (built from the rows already loaded, no extra query). */
async function loadLeaderTeam(
  projectId: number,
  reportMembers: AnyScoredMember[],
  sourceType: string,
): Promise<{ team: LeaderTeamMemberView[]; current: Map<number, CurrentPerson> }> {
  const [memberships, tasks] = await Promise.all([
    prisma.groupMembership.findMany({
      where: { projectId },
      orderBy: { joinedAt: "asc" },
      include: { user: { select: { id: true, name: true, githubUsername: true, avatarUpdatedAt: true, deletedAt: true } } },
    }),
    prisma.task.findMany({ where: { projectId }, select: { assignedToUserId: true, done: true } }),
  ]);

  const team = memberships.map((m) => {
    const gh = m.user.githubUsername?.toLowerCase() ?? null;
    const scored = sourceType === "GITHUB"
      ? (gh ? reportMembers.find((r) => r.githubUsername.toLowerCase() === gh) : undefined)
      : reportMembers.find((r) => "userId" in r && r.userId === m.userId);
    const combined = scored && sourceType === "COMBINED" ? (scored as CombinedScoredMember) : null;
    const mine = tasks.filter((t) => t.assignedToUserId === m.userId);
    return {
      userId: m.userId,
      name: m.user.name,
      isLeader: m.role === "LEADER",
      functionalRoles: JSON.parse(m.functionalRoles) as string[],
      hasAvatar: m.user.avatarUpdatedAt != null,
      avatarUpdatedAt: m.user.avatarUpdatedAt?.toISOString() ?? null,
      contributionShare: scored?.contributionShare ?? null,
      githubContributionShare: combined?.githubContributionShare ?? null,
      documentContributionShare: combined?.documentContributionShare ?? null,
      flags: scored?.flags ?? [],
      tasks: { open: mine.filter((t) => !t.done).length, done: mine.filter((t) => t.done).length },
    };
  });
  return { team, current: currentPeopleFrom(memberships) };
}

// ─── GET /api/student/group/:projectId ───────────────────────────────────────
// Student's drill-down: their contribution data for a specific group.
joinRouter.get("/api/student/group/:projectId", ...requireRole("STUDENT"), async (req, res) => {
  const idResult = z.coerce.number().int().positive().safeParse(req.params.projectId);
  if (!idResult.success) {
    res.status(400).json({ error: "Invalid project id" });
    return;
  }

  const userId    = req.user!.sub;
  const projectId = idResult.data;

  // Stage 1: everything that needs only the ids, read together. The membership and project checks keep their
  // old order (403, then 404); a non-member simply discards the other reads.
  const [membership, project, user, latestSuggestion, attachments, hasPreFixEvents] = await Promise.all([
    prisma.groupMembership.findUnique({
      where: { userId_projectId: { userId, projectId } },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        assignment: { include: { classSection: { include: { department: true } } } },
        reports: { orderBy: [...LATEST_REPORT_ORDER], take: 1 },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { githubUsername: true } }),
    prisma.roleSuggestion.findFirst({
      where:   { userId, projectId },
      orderBy: { createdAt: "desc" },
    }),
    attachmentMetaForGroup(projectId),
    groupHasPreFixEvents(projectId),
  ]);

  if (!membership) {
    res.status(403).json({ error: "You are not a member of this group." });
    return;
  }
  const isLeader = membership.role === "LEADER";

  if (!project?.assignment) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const cs   = project.assignment.classSection;
  const asgn = project.assignment;
  const sourceType = asgn.sourceType;

  const latestReport = project.reports[0] ?? null;
  const stored = latestReport?.content
    ? JSON.parse(latestReport.content) as { report?: TeamReport<AnyScoredMember>; scoringRulesVersion?: number; trigger?: "manual" | "auto"; narrative?: string; narrativeOutdated?: boolean; narrativeBasis?: string; narrativeAt?: string; narrativeNames?: Array<{ userId: number; name: string }> }
    : null;
  const teamReport = stored?.report ?? null;

  // Stage 2 (leader only): the badge counts on "Manage Group" and the team view, read together. Counts only;
  // RoleSuggestion is the one table behind both "change my role" and "add a role" requests. A member runs none of it.
  const [pendingJoinRequests, pendingRoleRequests, built] = isLeader
    ? await Promise.all([
        prisma.groupJoinRequest.count({ where: { projectId, status: "PENDING" } }),
        prisma.roleSuggestion.count({ where: { projectId, status: "PENDING" } }),
        teamReport ? loadLeaderTeam(projectId, teamReport.members, sourceType) : Promise.resolve(undefined),
      ])
    : [0, 0, undefined];
  const team = built?.team;

  const base = {
    classSection: {
      id: cs.id, subjectCode: cs.subjectCode, subjectName: cs.subjectName,
      department: { id: cs.department.id, name: cs.department.name, code: cs.department.code },
      edpCode: cs.edpCode,
    },
    assignment: {
      id: asgn.id, title: asgn.title,
      deadline:   asgn.deadline?.toISOString() ?? null,
      sourceType: asgn.sourceType,
      description: asgn.description,
      attachments,
    },
    // Present only for the group's leader (members never receive it).
    ...(isLeader ? { pendingCounts: { joinRequests: pendingJoinRequests, roleRequests: pendingRoleRequests } } : {}),
    project: {
      id: project.id,
      groupName: project.groupName || `Group ${project.id}`,
      repoUrl:   project.repoUrl,
    },
    membership: {
      role:            membership.role,
      functionalRoles: JSON.parse(membership.functionalRoles) as string[],
      joinedAt:        membership.joinedAt.toISOString(),
      roleSuggestion:  latestSuggestion ? {
        id:             latestSuggestion.id,
        suggestedRoles: JSON.parse(latestSuggestion.suggestedRoles) as string[],
        status:         latestSuggestion.status as "PENDING" | "ACCEPTED" | "DECLINED",
        createdAt:      latestSuggestion.createdAt.toISOString(),
      } : null,
    },
  };

  const docsDataApproximate = (sourceType === "EDITOR" || sourceType === "COMBINED") && hasPreFixEvents;

  if (!latestReport || !stored || !teamReport) {
    res.json({ ...base, hasReport: false, report: null });
    return;
  }

  // GITHUB has no userId anywhere in its scoring pipeline (Member/RawMemberStats/ScoredMember
  // are keyed only by githubUsername), so it stays matched that way. EDITOR and COMBINED members
  // always carry userId (sourced from GroupMembership, required for every member regardless of
  // source type), which is the reliable key there — githubUsername is optional/display-only for
  // EDITOR members (see RawDocumentMemberStats comment in shared/src/types.ts).
  let myScoredMember: AnyScoredMember | null = null;
  if (sourceType === "GITHUB") {
    const myGithubUsername = user?.githubUsername ?? null;
    myScoredMember = myGithubUsername
      ? (teamReport.members.find((m) => m.githubUsername === myGithubUsername) ?? null)
      : null;
  } else {
    myScoredMember = teamReport.members.find((m) => "userId" in m && m.userId === userId) ?? null;
  }

  let myContribution: Record<string, unknown> | null = null;
  if (myScoredMember) {
    if (sourceType === "GITHUB") {
      const m = myScoredMember as ScoredMember;
      myContribution = {
        contributionShare: m.contributionShare,
        commits:           m.commits,
        additions:         m.additions,
        deletions:         m.deletions,
        activeDays:        m.activeDays,
        commentLinesAdded: m.commentLinesAdded,
        blankLinesAdded:   m.blankLinesAdded,
        flags:             m.flags,
      };
    } else if (sourceType === "EDITOR") {
      const m = myScoredMember as DocumentScoredMember;
      myContribution = {
        contributionShare: m.contributionShare,
        sessionCount:       m.sessionCount,
        activeDays:         m.activeDays,
        retainedChars:      m.retainedChars,
        totalInsertedChars: m.totalInsertedChars,
        selfChurnRatio:     m.selfChurnRatio,
        importedRetainedChars: m.importNote ? m.importedRetainedChars : 0,
        insertedImageCount: m.insertedImageCount,
        flags:              m.flags,
      };
    } else {
      const m = myScoredMember as CombinedScoredMember;
      myContribution = {
        contributionShare:         m.contributionShare,
        githubContributionShare:   m.githubContributionShare,
        documentContributionShare: m.documentContributionShare,
        wGitHub:                   m.wGitHub,
        wDocs:                     m.wDocs,
        flags:                     m.flags,
        github: m.github ? {
          commits: m.github.commits, additions: m.github.additions,
          deletions: m.github.deletions, activeDays: m.github.activeDays,
          commentLinesAdded: m.github.commentLinesAdded, blankLinesAdded: m.github.blankLinesAdded,
        } : null,
        document: m.document ? {
          sessionCount: m.document.sessionCount, activeDays: m.document.activeDays,
          retainedChars: m.document.retainedChars, totalInsertedChars: m.document.totalInsertedChars,
          selfChurnRatio: m.document.selfChurnRatio,
          importedRetainedChars: m.document.importNote ? m.document.importedRetainedChars : 0,
          insertedImageCount: m.document.insertedImageCount,
        } : null,
      };
    }
  }

  // Privacy: a regular member receives only their own data — no other member's contributionShare,
  // name, userId, or githubUsername is included. The group LEADER (decided here, server-side, from
  // GroupMembership.role) additionally receives `team`, a whitelisted per-member view used to
  // distribute work fairly. Never includes disputes, instructor notes, emails or raw stats.

  // The leader's team explanation shows each member's CURRENT name (display only; read only when there is a
  // narrative to show, and the extra reads happen only for the leader). Done before studentNarrative, which
  // matches flagged people by name.
  const leaderNarrativeText = team && stored.narrative
    ? await narrativeForDisplay(projectId, stored, built!.current)
    : stored.narrative;

  res.json({
    ...base,
    hasReport: true,
    docsDataApproximate,
    rulesOutdated: isRulesOutdated(stored),
    scoringRulesVersion: stored.scoringRulesVersion ?? 1,
    autoUpdateFailed: autoUpdateFailed(project, asgn, latestReport.generatedAt),
    docsDataFixedAt: getAuthorshipFixAt().toISOString(),
    report: {
      evenness:    evennessOf(teamReport.teamHealth),
      analyzedAt:  latestReport.generatedAt.toISOString(),
      trigger:     stored.trigger ?? null,
      noActivity:  hasNoRecordedActivity(teamReport.members),
      dataConfidence: reportDataConfidence(teamReport.members, docsDataApproximate, asgn.deadline),
      quietSource: hasNoRecordedActivity(teamReport.members) ? null : quietSource(teamReport.members),
      memberCount: teamReport.memberCount,
      deadlineWindowBasis: teamReport.deadlineWindowBasis,
      myContribution,
      ...(team ? { team } : {}),
      // The leader reads the same team-level AI explanation as the instructor (without the Gini sentence).
      ...(team ? { narrative: studentNarrative(leaderNarrativeText, team.map((m) => ({ name: m.name, flags: m.flags }))), narrativeOutdated: isNarrativeOutdated({ ...stored, report: teamReport }) } : {}),
    },
  });
});

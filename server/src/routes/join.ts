import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import type { TeamReport } from "@shared/types.js";

export const joinRouter = Router();

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
      course: true, edpCode: true, joinCode: true,
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
    course:         cls.course,
    edpCode:        cls.edpCode,
    joinedAt:       enrollment.joinedAt.toISOString(),
  });
});

// ─── GET /api/student/classes ─────────────────────────────────────────────────
// Return all classes the student is enrolled in, with each assignment and
// the student's group (if any) per assignment.
joinRouter.get("/api/student/classes", ...requireRole("STUDENT"), async (req, res) => {
  const userId = req.user!.sub;

  const enrollments = await prisma.classEnrollment.findMany({
    where:   { userId },
    orderBy: { joinedAt: "asc" },
    include: {
      classSection: {
        include: {
          assignments: {
            orderBy: { createdAt: "asc" },
            include: {
              projects: {
                orderBy: { id: "asc" },
                include: {
                  groupMemberships: { where: { userId }, take: 1 },
                  reports: {
                    orderBy: { generatedAt: "desc" },
                    take: 1,
                    select: { gini: true, teamHealth: true, generatedAt: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const classes = enrollments.map((e) => {
    const cs = e.classSection;
    return {
      id:          cs.id,
      subjectCode: cs.subjectCode,
      subjectName: cs.subjectName,
      course:      cs.course,
      edpCode:     cs.edpCode,
      joinCode:    cs.joinCode,
      joinedAt:    e.joinedAt.toISOString(),
      // One entry per assignment — not per group/project
      assignments: cs.assignments.map((a) => {
        // Find the project (group) this student belongs to under this assignment
        const myProject = a.projects.find((p) => p.groupMemberships.length > 0) ?? null;
        const myMembership = myProject?.groupMemberships[0] ?? null;

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
                name:      myProject.name,
                repoUrl:   myProject.repoUrl,
                role:      myMembership.role,
                report:    myProject.reports[0]
                  ? {
                      gini:        myProject.reports[0].gini,
                      teamHealth:  myProject.reports[0].teamHealth,
                      generatedAt: myProject.reports[0].generatedAt.toISOString(),
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

  const cs = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: {
      assignments: {
        orderBy: { createdAt: "asc" },
        include: {
          projects: {
            orderBy: { id: "asc" },
            include: {
              members:          { select: { id: true } },
              groupMemberships: { include: { user: { select: { name: true } } } },
              reports: {
                orderBy: { generatedAt: "desc" },
                take: 1,
                select: { gini: true, teamHealth: true, generatedAt: true },
              },
            },
          },
        },
      },
    },
  });

  if (!cs) {
    res.status(404).json({ error: "Class not found." });
    return;
  }

  const assignments = cs.assignments.map((a) => {
    const myProject    = a.projects.find((p) => p.groupMemberships.some((m) => m.userId === userId)) ?? null;
    const myMembership = myProject?.groupMemberships.find((m) => m.userId === userId) ?? null;

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
            name:      myProject.name,
            repoUrl:   myProject.repoUrl,
            role:      myMembership.role,
            report:    myProject.reports[0]
              ? {
                  gini:        myProject.reports[0].gini,
                  teamHealth:  myProject.reports[0].teamHealth,
                  generatedAt: myProject.reports[0].generatedAt.toISOString(),
                }
              : null,
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
      course:      cs.course,
      edpCode:     cs.edpCode,
      joinCode:    cs.joinCode,
    },
    assignments,
  });
});

// ─── POST /api/join/create-group ─────────────────────────────────────────────
// Student creates a new group for an assignment, becoming the leader.
// Body: { projectId (the assignment id), groupName, repoUrl }
// Requires enrollment in the assignment's class.
joinRouter.post("/api/join/create-group", ...requireRole("STUDENT"), async (req, res) => {
  const result = z.object({
    assignmentId: z.number().int().positive(),
    groupName:    z.string().min(1, "Group name is required"),
    repoUrl:      z.string().default(""),
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
      select: { id: true, classSectionId: true, sourceType: true, maxGroupSize: true },
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

  // GitHub username + repo URL only required for GitHub-tracked assignments
  const needsGitHub = assignment.sourceType === "GITHUB" || assignment.sourceType === "COMBINED";
  if (needsGitHub && !user?.githubUsername) {
    res.status(400).json({ error: "Set your GitHub username in Settings before creating this group." });
    return;
  }
  if (needsGitHub && !result.data.repoUrl.trim()) {
    res.status(400).json({ error: "GitHub repository URL is required for this project." });
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
      name:         trimmedName,
      repoUrl:      result.data.repoUrl.trim(),
      assignmentId: assignment.id,
    },
  });

  await prisma.groupMembership.create({
    data: { userId, projectId: project.id, role: "LEADER" },
  });

  await prisma.member.create({
    data: {
      projectId:      project.id,
      studentName:    user!.name,
      githubUsername: user!.githubUsername ?? "",
    },
  });

  res.status(201).json({ id: project.id, groupName: project.groupName, role: "LEADER" });
});

// ─── POST /api/join/join-group ────────────────────────────────────────────────
// Student joins an existing group as a member.
// Body: { projectGroupId } — the project (group) id.
// Requires enrollment in the group's class.
joinRouter.post("/api/join/join-group", ...requireRole("STUDENT"), async (req, res) => {
  const result = z.object({
    projectGroupId: z.number().int().positive(),
  }).safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const userId = req.user!.sub;

  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.project.findUnique({
      where: { id: result.data.projectGroupId },
      include: {
        assignment: {
          select: { maxGroupSize: true, sourceType: true, classSectionId: true },
        },
        members: { select: { id: true } },
      },
    }),
  ]);

  if (!project?.assignmentId || !project.assignment) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  // Verify enrollment in the class
  const enrollment = await prisma.classEnrollment.findUnique({
    where: {
      userId_classSectionId: {
        userId,
        classSectionId: project.assignment.classSectionId,
      },
    },
  });
  if (!enrollment) {
    res.status(403).json({ error: "You must be enrolled in this class to join a group." });
    return;
  }

  // GitHub username only required for GitHub-tracked assignments
  const needsGitHub = project.assignment.sourceType === "GITHUB" || project.assignment.sourceType === "COMBINED";
  if (needsGitHub && !user?.githubUsername) {
    res.status(400).json({ error: "Set your GitHub username in Settings before joining this group." });
    return;
  }

  // One group per student per assignment
  const alreadyIn = await prisma.groupMembership.findFirst({
    where: { userId, project: { assignmentId: project.assignmentId } },
  });
  if (alreadyIn) {
    res.status(409).json({ error: "You are already in a group for this project." });
    return;
  }

  if (project.members.length >= project.assignment.maxGroupSize) {
    res.status(409).json({ error: "This group is full." });
    return;
  }

  await prisma.$transaction([
    prisma.groupMembership.create({
      data: { userId, projectId: project.id, role: "MEMBER" },
    }),
    prisma.project.update({
      where: { id: project.id },
      data:  { membershipChangedAt: new Date() },
    }),
  ]);

  await prisma.member.create({
    data: {
      projectId:      project.id,
      studentName:    user!.name,
      githubUsername: user!.githubUsername ?? "",
    },
  });

  res.status(201).json({
    id:        project.id,
    groupName: project.groupName || `Group ${project.id}`,
    role:      "MEMBER",
  });
});

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

  const membership = await prisma.groupMembership.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this group." });
    return;
  }

  const [project, user] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        assignment: { include: { classSection: true } },
        reports: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { githubUsername: true } }),
  ]);

  if (!project?.assignment) {
    res.status(404).json({ error: "Project not found." });
    return;
  }

  const cs   = project.assignment.classSection;
  const asgn = project.assignment;

  const base = {
    classSection: {
      id: cs.id, subjectCode: cs.subjectCode, subjectName: cs.subjectName,
      course: cs.course, edpCode: cs.edpCode,
    },
    assignment: {
      id: asgn.id, title: asgn.title,
      deadline:   asgn.deadline?.toISOString() ?? null,
      sourceType: asgn.sourceType,
    },
    project: {
      id: project.id,
      groupName: project.groupName || `Group ${project.id}`,
      name:      project.name,
      repoUrl:   project.repoUrl,
    },
    membership: {
      role:            membership.role,
      functionalRoles: JSON.parse(membership.functionalRoles) as string[],
      joinedAt:        membership.joinedAt.toISOString(),
    },
  };

  const latestReport = project.reports[0] ?? null;
  if (!latestReport?.content) {
    res.json({ ...base, hasReport: false, report: null });
    return;
  }

  const stored = JSON.parse(latestReport.content) as { report?: TeamReport };
  if (!stored.report) {
    res.json({ ...base, hasReport: false, report: null });
    return;
  }

  const teamReport       = stored.report;
  const myGithubUsername = user?.githubUsername ?? null;
  const myScoredMember   = myGithubUsername
    ? (teamReport.members.find((m) => m.githubUsername === myGithubUsername) ?? null)
    : null;

  const sharesWithMe = teamReport.members
    .map((m) => ({ share: m.contributionShare, isMe: m.githubUsername === myGithubUsername }))
    .sort((a, b) => b.share - a.share);

  res.json({
    ...base,
    hasReport: true,
    report: {
      gini:        teamReport.gini,
      teamHealth:  teamReport.teamHealth,
      analyzedAt:  latestReport.generatedAt.toISOString(),
      memberCount: teamReport.memberCount,
      myContribution: myScoredMember ? {
        contributionShare: myScoredMember.contributionShare,
        commits:           myScoredMember.commits,
        additions:         myScoredMember.additions,
        deletions:         myScoredMember.deletions,
        activeDays:        myScoredMember.activeDays,
        flags:             myScoredMember.flags,
      } : null,
      teamShares: sharesWithMe,
    },
  });
});

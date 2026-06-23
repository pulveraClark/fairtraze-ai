import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRole } from "../middleware/auth.js";
import type { TeamReport } from "@shared/types.js";

export const joinRouter = Router();

// POST /api/join/lookup — validate a join code, return project info + existing groups
joinRouter.post("/api/join/lookup", ...requireRole("STUDENT"), async (req, res) => {
  const result = z.object({ joinCode: z.string().min(1) }).safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Please enter a join code." });
    return;
  }

  const code = result.data.joinCode.trim().toUpperCase();

  const assignment = await prisma.assignment.findUnique({
    where: { joinCode: code },
    include: { classSection: true },
  });

  if (!assignment) {
    res.status(404).json({ error: "Invalid join code. Check the code and try again." });
    return;
  }

  const projects = await prisma.project.findMany({
    where: { assignmentId: assignment.id },
    orderBy: { id: "asc" },
    include: {
      members: { select: { id: true } },
      groupMemberships: {
        where: { role: "LEADER" },
        include: { user: { select: { name: true } } },
        take: 1,
      },
    },
  });

  res.json({
    assignment: {
      id:          assignment.id,
      title:       assignment.title,
      deadline:    assignment.deadline?.toISOString() ?? null,
      sourceType:  assignment.sourceType,
      maxGroupSize: assignment.maxGroupSize,
      classSection: {
        subjectCode: assignment.classSection.subjectCode,
        subjectName: assignment.classSection.subjectName,
      },
    },
    groups: projects.map((p) => ({
      id:          p.id,
      groupName:   p.groupName || `Group ${p.id}`,
      memberCount: p.members.length,
      leaderName:  p.groupMemberships[0]?.user.name ?? null,
      isFull:      p.members.length >= assignment.maxGroupSize,
    })),
  });
});

// POST /api/join/create-group — student creates a new group, becomes leader
joinRouter.post("/api/join/create-group", ...requireRole("STUDENT"), async (req, res) => {
  const result = z.object({
    joinCode:  z.string().min(1),
    groupName: z.string().min(1, "Group name is required"),
    repoUrl:   z.string().default(""),
  }).safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const userId = req.user!.sub;
  const code   = result.data.joinCode.trim().toUpperCase();

  // Fetch user and assignment in parallel — need sourceType before checking githubUsername
  const [user, assignment] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.assignment.findUnique({ where: { joinCode: code } }),
  ]);

  if (!assignment) {
    res.status(404).json({ error: "Invalid join code." });
    return;
  }

  // GitHub username and repo URL only required when the project attributes to GitHub
  const needsGitHub = assignment.sourceType === "GITHUB" || assignment.sourceType === "COMBINED";
  if (needsGitHub && !user?.githubUsername) {
    res.status(400).json({ error: "Set your GitHub username in Settings before creating this group." });
    return;
  }
  if (needsGitHub && !result.data.repoUrl.trim()) {
    res.status(400).json({ error: "GitHub repository URL is required for this project." });
    return;
  }

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

// POST /api/join/join-group — student joins an existing group, becomes member
joinRouter.post("/api/join/join-group", ...requireRole("STUDENT"), async (req, res) => {
  const result = z.object({
    projectGroupId: z.number().int().positive(),
  }).safeParse(req.body);

  if (!result.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const userId = req.user!.sub;

  // Fetch user and project in parallel — need sourceType before checking githubUsername
  const [user, project] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.project.findUnique({
      where: { id: result.data.projectGroupId },
      include: {
        assignment: { select: { maxGroupSize: true, sourceType: true } },
        members:    { select: { id: true } },
      },
    }),
  ]);

  if (!project?.assignmentId || !project.assignment) {
    res.status(404).json({ error: "Group not found." });
    return;
  }

  // GitHub username only required when the project actually attributes to GitHub
  const needsGitHub = project.assignment.sourceType === "GITHUB" || project.assignment.sourceType === "COMBINED";
  if (needsGitHub && !user?.githubUsername) {
    res.status(400).json({ error: "Set your GitHub username in Settings before joining this group." });
    return;
  }

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

  await prisma.groupMembership.create({
    data: { userId, projectId: project.id, role: "MEMBER" },
  });

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

// GET /api/student/me — student's enrolled classes and their groups
joinRouter.get("/api/student/me", ...requireRole("STUDENT"), async (req, res) => {
  const memberships = await prisma.groupMembership.findMany({
    where: { userId: req.user!.sub },
    include: {
      project: {
        include: {
          assignment: {
            include: { classSection: true },
          },
          reports: {
            orderBy: { generatedAt: "desc" },
            take: 1,
            select: { gini: true, teamHealth: true, generatedAt: true },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const enrollments = memberships
    .filter((m) => m.project.assignment)
    .map((m) => {
      const cs  = m.project.assignment!.classSection;
      const asgn = m.project.assignment!;
      return {
        classSection: {
          id:          cs.id,
          subjectCode: cs.subjectCode,
          subjectName: cs.subjectName,
          course:      cs.course,
          edpCode:     cs.edpCode,
        },
        assignment: {
          id:          asgn.id,
          title:       asgn.title,
          deadline:    asgn.deadline?.toISOString() ?? null,
          sourceType:  asgn.sourceType,
        },
        project: {
          id:        m.project.id,
          groupName: m.project.groupName || `Group ${m.project.id}`,
          name:      m.project.name,
          repoUrl:   m.project.repoUrl,
        },
        membership: {
          role:     m.role,
          joinedAt: m.joinedAt.toISOString(),
        },
        report: m.project.reports[0]
          ? {
              gini:        m.project.reports[0].gini,
              teamHealth:  m.project.reports[0].teamHealth,
              generatedAt: m.project.reports[0].generatedAt.toISOString(),
            }
          : null,
      };
    });

  res.json({ enrollments });
});

// GET /api/student/group/:projectId — student's drill-down view of their own group + stored report
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
    membership: { role: membership.role, joinedAt: membership.joinedAt.toISOString() },
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

  // Build team shares with isMe flag (sorted descending) — no names, no per-member flags
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

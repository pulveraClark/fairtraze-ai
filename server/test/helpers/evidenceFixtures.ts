import { prisma } from "../../src/lib/prisma.js";
import {
  createUser, createClassSection, createAssignment, createProject, createMembership,
} from "../factories.js";

export type Source = "GITHUB" | "EDITOR" | "COMBINED";

// A stored report that deliberately carries everything the evidence report must NOT print
// (Gini, team health, usernames, commit and line counts, AI text) so the leak checks have teeth.
export type Variant = "default" | "quiet-docs" | "no-member-weights";

function storedContent(sourceType: Source, variant: Variant = "default") {
  const base = (name: string, share: number, flags: string[]) => ({
    studentName: name, githubUsername: `${name.toLowerCase()}-secret-gh`, userId: 0,
    commits: 111, additions: 2222, deletions: 33, contributionShare: share, flags,
  });
  // quiet-docs: nobody has Docs activity, so members carry effective weights 1/0 while the configured blend is 55/45.
  // no-member-weights: an old report whose members carry no wGitHub/wDocs (the configured blend is the fallback).
  const w =
    variant === "quiet-docs" ? { wGitHub: 1, wDocs: 0 }
    : variant === "no-member-weights" ? {}
    : { wGitHub: 0.4, wDocs: 0.6 };
  const members =
    sourceType === "COMBINED"
      ? [
          { ...base("Alice", 0.6, ["overload"]), githubContributionShare: 0.7, documentContributionShare: 0.5, ...w },
          { ...base("Bob", 0.4, []), githubContributionShare: 0.3, documentContributionShare: 0.5, ...w },
        ]
      : [base("Alice", 0.6, ["overload"]), base("Bob", 0.4, [])];
  const blend = variant === "default" ? { wGitHub: 0.4, wDocs: 0.6 } : { wGitHub: 0.55, wDocs: 0.45 };
  return JSON.stringify({
    report: { members, memberCount: 2, gini: 0.987, teamHealth: "High Risk", deadlineWindowBasis: "activity-span" },
    narrative: "AI TEXT SHOULD NEVER APPEAR",
    scoringConfig: {
      weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
      thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
      blend,
    },
  });
}

export async function saveReport(projectId: number, sourceType: Source, variant: Variant = "default") {
  return prisma.report.create({
    data: { projectId, gini: 0.987, teamHealth: "High Risk", content: storedContent(sourceType, variant) },
  });
}

export async function setup(sourceType: Source = "GITHUB") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group Evidence" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lena Leader" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  return { instructor, project, leader, member };
}

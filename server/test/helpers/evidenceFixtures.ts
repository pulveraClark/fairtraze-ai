import { prisma } from "../../src/lib/prisma.js";
import {
  createUser, createClassSection, createAssignment, createProject, createMembership,
} from "../factories.js";

export type Source = "GITHUB" | "EDITOR" | "COMBINED";

// A stored report that deliberately carries everything the evidence report must NOT print
// (Gini, team health, usernames, commit and line counts, AI text) so the leak checks have teeth.
function storedContent(sourceType: Source) {
  const base = (name: string, share: number, flags: string[]) => ({
    studentName: name, githubUsername: `${name.toLowerCase()}-secret-gh`, userId: 0,
    commits: 111, additions: 2222, deletions: 33, contributionShare: share, flags,
  });
  const members =
    sourceType === "COMBINED"
      ? [
          { ...base("Alice", 0.6, ["overload"]), githubContributionShare: 0.7, documentContributionShare: 0.5, wGitHub: 0.4, wDocs: 0.6 },
          { ...base("Bob", 0.4, []), githubContributionShare: 0.3, documentContributionShare: 0.5, wGitHub: 0.4, wDocs: 0.6 },
        ]
      : [base("Alice", 0.6, ["overload"]), base("Bob", 0.4, [])];
  return JSON.stringify({
    report: { members, memberCount: 2, gini: 0.987, teamHealth: "High Risk", deadlineWindowBasis: "activity-span" },
    narrative: "AI TEXT SHOULD NEVER APPEAR",
    scoringConfig: {
      weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
      thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
      blend: { wGitHub: 0.4, wDocs: 0.6 },
    },
  });
}

export async function saveReport(projectId: number, sourceType: Source) {
  return prisma.report.create({
    data: { projectId, gini: 0.987, teamHealth: "High Risk", content: storedContent(sourceType) },
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

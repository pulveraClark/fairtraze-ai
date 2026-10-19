import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { generateAlertsForProject } from "../src/lib/alerts.js";
import { createUser, createClassSection, createAssignment, createProject } from "./factories.js";

type Report = Parameters<typeof generateAlertsForProject>[1];

const report = (teamHealth: string, flaggedMembers: number, memberCount = 3): Report =>
  ({
    teamHealth,
    gini: 0.3,
    members: Array.from({ length: memberCount }, (_, i) => ({ flags: i < flaggedMembers ? ["free-rider"] : [] })),
  }) as unknown as Report;

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id, groupName: "Group 1" });
  const meta = { groupName: "Group 1", assignmentLabel: "", assignmentId: asg.id };
  return { instructor, project, meta };
}

describe("one alert per analysis (R10)", () => {
  it("risky and flagged: one alert of the risk type with the combined message, linking to that group's report", async () => {
    const { instructor, project, meta } = await setup();
    await generateAlertsForProject(project.id, report("Moderate Risk", 1), meta);
    const rows = await prisma.alert.findMany({ where: { projectId: project.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.type).toBe("MODERATE_RISK");
    expect(rows[0]!.message).toBe("Group 1: Moderate risk · 1 member flagged");
    expect(rows[0]!.link).toBe(`/project/${project.id}?tab=report`);
    expect(rows[0]!.recipientId).toBe(instructor.id);
  });

  it("high risk with several flagged members pluralises", async () => {
    const { project, meta } = await setup();
    await generateAlertsForProject(project.id, report("High Risk", 2), meta);
    const rows = await prisma.alert.findMany({ where: { projectId: project.id } });
    expect(rows.map((r) => [r.type, r.message])).toEqual([["HIGH_RISK", "Group 1: High risk · 2 members flagged"]]);
  });

  it("risky without flags: risk text only", async () => {
    const { project, meta } = await setup();
    await generateAlertsForProject(project.id, report("Moderate Risk", 0), meta);
    const rows = await prisma.alert.findMany({ where: { projectId: project.id } });
    expect(rows.map((r) => r.message)).toEqual(["Group 1: Moderate risk"]);
  });

  it("healthy with a flagged member: a MEMBER_FLAGGED alert; healthy and unflagged: none", async () => {
    const { project, meta } = await setup();
    await generateAlertsForProject(project.id, report("Healthy", 0), meta);
    expect(await prisma.alert.count({ where: { projectId: project.id } })).toBe(0);
    await generateAlertsForProject(project.id, report("Healthy", 1), meta);
    const rows = await prisma.alert.findMany({ where: { projectId: project.id } });
    expect(rows.map((r) => [r.type, r.message])).toEqual([["MEMBER_FLAGGED", "Group 1: 1 member flagged"]]);
  });

  it("re-analysis updates the unread alert in place and folds older siblings into it", async () => {
    const { instructor, project, meta } = await setup();
    // A leftover pair from before this change.
    await prisma.alert.createMany({
      data: [
        { projectId: project.id, instructorId: instructor.id, recipientId: instructor.id, type: "MEMBER_FLAGGED", message: "old flagged" },
        { projectId: project.id, instructorId: instructor.id, recipientId: instructor.id, type: "MODERATE_RISK", message: "old risk" },
      ],
    });
    await generateAlertsForProject(project.id, report("High Risk", 1), meta);
    const unread = await prisma.alert.findMany({ where: { projectId: project.id, read: false } });
    expect(unread).toHaveLength(1);
    expect(unread[0]!.type).toBe("HIGH_RISK");
    expect(unread[0]!.message).toBe("Group 1: High risk · 1 member flagged");
    expect(await prisma.alert.count({ where: { projectId: project.id } })).toBe(2);
  });
});

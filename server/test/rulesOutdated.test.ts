import { describe, it, expect } from "vitest";
import request from "supertest";
import { SCORING_RULES_VERSION } from "@shared/scoringRules.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

async function setup(sourceType: "GITHUB" | "EDITOR" = "EDITOR") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id });
  const { user: student } = await createUser({ systemRole: "STUDENT" });
  await createMembership(student.id, project.id, "MEMBER");
  return { instructor, project, student };
}

async function saveReport(projectId: number, extra: Record<string, unknown>) {
  const report = { members: [], memberCount: 0, gini: 0, teamHealth: "Healthy", deadlineWindowBasis: "activity-span" };
  await prisma.report.create({
    data: { projectId, gini: 0, teamHealth: "Healthy", content: JSON.stringify({ report, narrative: null, unmatchedLogins: [], ...extra }) },
  });
}

async function summaryItem(instructor: Awaited<ReturnType<typeof setup>>["instructor"], projectId: number) {
  const res = await request(app).get("/api/projects/summary").set("Authorization", authHeaderFor(instructor));
  return (res.body.summary as { projectId: number; rulesOutdated: boolean }[]).find((s) => s.projectId === projectId);
}

describe("reports scored with older rules are marked outdated (read time, nothing recomputed)", () => {
  it("a report without scoringRulesVersion is outdated for the instructor (summary and report) and the student", async () => {
    const { instructor, project, student } = await setup("EDITOR");
    await saveReport(project.id, { scoringConfig: null });

    expect((await summaryItem(instructor, project.id))?.rulesOutdated).toBe(true);

    const rep = await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(instructor));
    expect(rep.status).toBe(200);
    expect(rep.body.rulesOutdated).toBe(true);

    const stu = await request(app).get(`/api/student/group/${project.id}`).set("Authorization", authHeaderFor(student));
    expect(stu.status).toBe(200);
    expect(stu.body.rulesOutdated).toBe(true);
  });

  it("a report stored with the current version is not outdated", async () => {
    const { instructor, project, student } = await setup("EDITOR");
    await saveReport(project.id, { scoringConfig: null, scoringRulesVersion: SCORING_RULES_VERSION });

    expect((await summaryItem(instructor, project.id))?.rulesOutdated).toBe(false);
    const rep = await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(instructor));
    expect(rep.body.rulesOutdated).toBe(false);
    const stu = await request(app).get(`/api/student/group/${project.id}`).set("Authorization", authHeaderFor(student));
    expect(stu.body.rulesOutdated).toBe(false);
  });

  it("the stored report content is not rewritten when it is read", async () => {
    const { instructor, project } = await setup("EDITOR");
    await saveReport(project.id, { scoringConfig: null });
    const before = await prisma.report.findFirst({ where: { projectId: project.id } });
    await summaryItem(instructor, project.id);
    await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(instructor));
    const after = await prisma.report.findFirst({ where: { projectId: project.id } });
    expect(after?.content).toBe(before?.content);
  });
});

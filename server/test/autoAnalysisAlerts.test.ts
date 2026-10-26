import { describe, it, expect, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { generateFairnessNarrative } from "../src/lib/gemini.js";
import { resultsChanged, reportPolicy } from "../src/lib/resultsChange.js";
import { runAnalysis, silentProgress } from "../src/lib/analysisRunner.js";
import { createUser, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const rep = (teamHealth: string, flags: string[][]) => ({
  teamHealth,
  members: flags.map((f, i) => ({ userId: i + 1, flags: f })),
});

describe("resultsChanged / reportPolicy (pure)", () => {
  it("is false for the same health and flags, true when either differs or there is no previous report", () => {
    expect(resultsChanged(rep("Healthy", [[], []]), rep("Healthy", [[], []]))).toBe(false);
    expect(resultsChanged(rep("Healthy", [[], []]), rep("Moderate Risk", [[], []]))).toBe(true);
    expect(resultsChanged(rep("Healthy", [[], []]), rep("Healthy", [["free-rider"], []]))).toBe(true);
    expect(resultsChanged(undefined, rep("Healthy", []))).toBe(true);
  });

  it("flag order does not matter", () => {
    expect(resultsChanged(rep("Healthy", [["inactive", "free-rider"]]), rep("Healthy", [["free-rider", "inactive"]]))).toBe(false);
  });

  it("automatic: notifies only on change and marks an existing narrative outdated; manual always notifies", () => {
    const same = reportPolicy("auto", { report: rep("Healthy", [[]]) }, rep("Healthy", [[]]), "text");
    expect(same.notify).toBe(false);
    expect(same.contentExtras).toEqual({ trigger: "auto" });

    const changed = reportPolicy("auto", { report: rep("Healthy", [[]]) }, rep("High Risk", [["free-rider"]]), "text");
    expect(changed.notify).toBe(true);
    expect(changed.contentExtras).toEqual({ trigger: "auto", narrativeOutdated: true });

    expect(reportPolicy("auto", { report: rep("Healthy", [[]]) }, rep("High Risk", [["free-rider"]]), null).contentExtras).toEqual({ trigger: "auto" });
    expect(reportPolicy("manual", { report: rep("Healthy", [[]]) }, rep("Healthy", [[]]), "text").notify).toBe(true);
    // an outdated flag stays until a new explanation is generated
    expect(reportPolicy("auto", { report: rep("Healthy", [[]]), narrativeOutdated: true }, rep("Healthy", [[]]), "text").contentExtras.narrativeOutdated).toBe(true);
  });
});

describe("automatic run, end to end (Docs-only group)", () => {
  async function setup() {
    const { user: instructor } = await createUser();
    const cs = await createClassSection(instructor.id);
    const asg = await createAssignment(cs.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: asg.id, repoUrl: null });
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    await createMembership(student.id, project.id, "LEADER");
    return { project, student };
  }
  const run = (id: number, trigger: "auto" | "manual") => runAnalysis(id, { progress: silentProgress, actorInstructorId: null, trigger });
  const unread = (studentId: number) => prisma.alert.count({ where: { recipientId: studentId, type: "REPORT_READY", read: false } });
  const latestContent = async (projectId: number) => {
    const latest = await prisma.report.findFirst({ where: { projectId }, orderBy: { id: "desc" } });
    return JSON.parse(latest!.content!);
  };

  it("raises the report-ready alert on the first run, stays quiet when nothing changed, and records the trigger", async () => {
    const { project, student } = await setup();
    expect((await run(project.id, "auto")).status).toBe(200);
    expect(await unread(student.id)).toBe(1);

    await prisma.alert.updateMany({ data: { read: true } });
    expect((await run(project.id, "auto")).status).toBe(200);
    expect(await unread(student.id)).toBe(0);
    expect((await latestContent(project.id)).trigger).toBe("auto");

    expect((await run(project.id, "manual")).status).toBe(200);
    expect(await unread(student.id)).toBe(1);
    expect((await latestContent(project.id)).trigger).toBe("manual");
  });

  it("when results changed and a narrative exists it is marked outdated, and Gemini is never called", async () => {
    const { project } = await setup();
    await prisma.report.create({
      data: {
        projectId: project.id,
        teamHealth: "High Risk",
        content: JSON.stringify({ report: { teamHealth: "High Risk", members: [{ userId: 999, flags: ["free-rider"] }] }, narrative: "Old explanation." }),
      },
    });
    await run(project.id, "auto");
    const content = await latestContent(project.id);
    expect(content.narrative).toBe("Old explanation.");
    expect(content.narrativeOutdated).toBe(true);
    expect(vi.mocked(generateFairnessNarrative)).not.toHaveBeenCalled();
  });

  it("no narrative: nothing is marked", async () => {
    const { project } = await setup();
    await run(project.id, "auto");
    expect((await latestContent(project.id)).narrativeOutdated).toBeUndefined();
  });
});

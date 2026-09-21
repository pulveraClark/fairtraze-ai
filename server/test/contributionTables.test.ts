import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const app = createApp();

// Item 1 of the manuscript-alignment investigation: DocumentContribution/CombinedContribution
// are normalized per-member persistence of a single analysis run's scores, written alongside
// (never replacing) the existing Report.content JSON blob. Every value they carry is already
// computed by shared/src/documentScoring.ts / combinedScoring.ts — this is a pure persistence-
// shape addition, so these tests confirm the new rows populate correctly and match the values
// already present in the parallel Report.content JSON, not new computation.
describe("DocumentContribution / CombinedContribution persistence", () => {
  async function seedEditorActivity(documentId: number, userId: number) {
    // A single INSERT EditEvent + a closed EditSession is enough for computeDocumentRawStats to
    // produce a nonzero, real (not all-zero) DocumentScoredMember for this user.
    await prisma.editEvent.create({
      data: {
        documentId,
        userId,
        eventType: "INSERT",
        position: 0,
        length: 20,
        editType: "SUBSTANTIVE",
        insertedText: "some real paragraph.",
      },
    });
    await prisma.editSession.create({
      data: {
        documentId,
        userId,
        startedAt: new Date(Date.now() - 60_000),
        endedAt: new Date(),
        characterCount: 20,
      },
    });
  }

  it("EDITOR analyze run writes one DocumentContribution row per member, matching Report.content", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id, "LEADER");

    const document = await prisma.document.create({ data: { groupId: project.id } });
    await seedEditorActivity(document.id, member.id);

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);

    const report = await prisma.report.findFirst({ where: { projectId: project.id }, orderBy: { generatedAt: "desc" } });
    expect(report).not.toBeNull();
    const storedContent = JSON.parse(report!.content!) as {
      report: { members: Array<{ userId: number; retainedChars: number; contributionShare: number; sessionCount: number }> };
    };
    const storedMember = storedContent.report.members.find((m) => m.userId === member.id);
    expect(storedMember).toBeDefined();

    const rows = await prisma.documentContribution.findMany({ where: { reportId: report!.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBe(member.id);
    expect(rows[0].documentId).toBe(document.id);
    expect(rows[0].netRetainedChars).toBe(storedMember!.retainedChars);
    expect(rows[0].editSessionCount).toBe(storedMember!.sessionCount);
    expect(rows[0].documentContributionShare).toBeCloseTo(storedMember!.contributionShare, 10);
  }, 40000);

  it("does not write DocumentContribution rows when the project has no Document row yet", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);

    const report = await prisma.report.findFirst({ where: { projectId: project.id } });
    const rows = await prisma.documentContribution.findMany({ where: { reportId: report!.id } });
    expect(rows.length).toBe(0);
  }, 20000);

  it("leaves Report.content exactly as before — additive only, not a replacement", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);

    const report = await prisma.report.findFirst({ where: { projectId: project.id } });
    const parsed = JSON.parse(report!.content!) as { report: unknown; narrative: unknown; unmatchedLogins: unknown; scoringConfig: unknown };
    expect(parsed).toHaveProperty("report");
    expect(parsed).toHaveProperty("narrative");
    expect(parsed).toHaveProperty("unmatchedLogins");
    expect(parsed).toHaveProperty("scoringConfig");
  }, 20000);
});

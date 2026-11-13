import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

// 2026-11-10 12:00 UTC is 20:00 on Nov 10 in Manila; 2026-11-10 17:00 UTC is already Nov 11 there.
const NOV10 = new Date("2026-11-10T12:00:00Z");
const NOV10_LATE_UTC = new Date("2026-11-10T17:00:00Z");

async function setup(sourceType: "EDITOR" | "COMBINED" | "GITHUB" = "EDITOR") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType });
  const project = await createProject({ assignmentId: asg.id });
  const { user: lead } = await createUser({ systemRole: "STUDENT", name: "Lead" });
  const { user: other } = await createUser({ systemRole: "STUDENT", name: "Other" });
  await createMembership(lead.id, project.id, "LEADER");
  await createMembership(other.id, project.id, "MEMBER");
  const doc = await prisma.document.create({ data: { groupId: project.id } });
  return { instructor, project, lead, other, doc };
}

async function insert(documentId: number, userId: number, position: number, length: number, timestamp: Date, source: "LIVE" | "IMPORT" = "LIVE") {
  await prisma.editEvent.create({ data: { documentId, userId, eventType: "INSERT", position, length, timestamp, source, editType: "SUBSTANTIVE" } });
}

async function saveReport(projectId: number, documentId: number, users: { id: number; name: string }[], generatedAt?: Date) {
  const raw = await computeDocumentRawStats(documentId, users.map((u) => ({ userId: u.id, studentName: u.name, githubUsername: "" })));
  const report = computeDocumentTeamReport(raw);
  await prisma.report.create({
    data: {
      projectId, gini: report.gini, teamHealth: report.teamHealth,
      ...(generatedAt ? { generatedAt } : {}),
      content: JSON.stringify({ report, narrative: null, unmatchedLogins: [], scoringRulesVersion: 3 }),
    },
  });
  return report;
}

const reportAs = (instructor: Parameters<typeof authHeaderFor>[0], projectId: number) =>
  request(app).get(`/api/projects/${projectId}/report`).set("Authorization", authHeaderFor(instructor));

describe("GET /api/projects/:id/report — docsOneGo", () => {
  it("lists a member whose text arrived in one big LIVE insert, with the Manila day, and nothing else", async () => {
    const { instructor, project, lead, other, doc } = await setup();
    await insert(doc.id, lead.id, 0, 2000, NOV10_LATE_UTC);        // one go -> Nov 11 in Manila
    for (let i = 0; i < 40; i++) await insert(doc.id, other.id, 2000 + i * 10, 10, NOV10); // typed in small pieces
    await saveReport(project.id, doc.id, [lead, other], new Date("2026-11-12T00:00:00Z"));
    const res = await reportAs(instructor, project.id);
    expect(res.status).toBe(200);
    expect(res.body.docsOneGo).toEqual([{ userId: lead.id, day: "2026-11-11" }]);
  });

  it("changes no score, flag, Gini or team health", async () => {
    const { instructor, project, lead, other, doc } = await setup();
    await insert(doc.id, lead.id, 0, 2000, NOV10);
    await insert(doc.id, other.id, 2000, 100, NOV10);
    const report = await saveReport(project.id, doc.id, [lead, other], new Date("2026-11-12T00:00:00Z"));
    const res = await reportAs(instructor, project.id);
    expect(res.body.report).toEqual(JSON.parse(JSON.stringify(report)));
    expect(res.body.report.gini).toBe(report.gini);
  });

  it("ignores IMPORT inserts, small inserts, and inserts newer than the report", async () => {
    const { instructor, project, lead, other, doc } = await setup();
    await insert(doc.id, lead.id, 0, 2000, NOV10, "IMPORT");
    await insert(doc.id, other.id, 2000, 500, NOV10);
    const report = await saveReport(project.id, doc.id, [lead, other], new Date("2026-11-12T00:00:00Z"));
    expect(report.members.length).toBe(2);
    await insert(doc.id, other.id, 3000, 5000, new Date("2026-11-13T00:00:00Z")); // after the report
    expect((await reportAs(instructor, project.id)).body.docsOneGo).toEqual([]);
  });

  it("ignores events before the authorship fix", async () => {
    const { instructor, project, lead, doc } = await setup();
    await insert(doc.id, lead.id, 0, 2000, new Date("2026-09-01T00:00:00Z"));
    await saveReport(project.id, doc.id, [lead], new Date("2026-11-12T00:00:00Z"));
    expect((await reportAs(instructor, project.id)).body.docsOneGo).toEqual([]);
  });

  it("does not apply when the big insert was mostly deleted again", async () => {
    const { instructor, project, lead, doc } = await setup();
    await insert(doc.id, lead.id, 0, 4000, NOV10);
    await prisma.editEvent.create({ data: { documentId: doc.id, userId: lead.id, eventType: "DELETE", position: 0, length: 3000, timestamp: new Date("2026-11-10T13:00:00Z") } });
    await saveReport(project.id, doc.id, [lead], new Date("2026-11-12T00:00:00Z"));
    expect((await reportAs(instructor, project.id)).body.docsOneGo).toEqual([]);
  });

  it("is empty for a group with no events, a GITHUB group and an old report", async () => {
    const empty = await setup();
    await saveReport(empty.project.id, empty.doc.id, [empty.lead]);
    expect((await reportAs(empty.instructor, empty.project.id)).body.docsOneGo).toEqual([]);

    const gh = await setup("GITHUB");
    await insert(gh.doc.id, gh.lead.id, 0, 5000, NOV10);
    await prisma.report.create({
      data: { projectId: gh.project.id, gini: 0, teamHealth: "Healthy", content: JSON.stringify({ report: { members: [], memberCount: 2, gini: 0, teamHealth: "Healthy" }, narrative: null, unmatchedLogins: [] }) },
    });
    expect((await reportAs(gh.instructor, gh.project.id)).body.docsOneGo).toEqual([]);
  });

  it("is never stored in the report and never in a student or leader response, the evidence report or the privacy export", async () => {
    const { instructor, project, lead, other, doc } = await setup();
    await insert(doc.id, lead.id, 0, 2000, NOV10);
    await insert(doc.id, other.id, 2000, 100, NOV10);
    await saveReport(project.id, doc.id, [lead, other], new Date("2026-11-12T00:00:00Z"));
    expect((await reportAs(instructor, project.id)).body.docsOneGo).toHaveLength(1);

    const stored = await prisma.report.findFirstOrThrow({ where: { projectId: project.id } });
    expect(stored.content).not.toMatch(/oneGo|OneGo/);

    for (const who of [lead, other]) {
      for (const url of [
        `/api/student/group/${project.id}`,
        `/api/groups/${project.id}/evidence-report`,
        `/api/privacy/export`,
        `/api/groups/${project.id}/document/authorship`,
      ]) {
        const res = await request(app).get(url).set("Authorization", authHeaderFor(who));
        expect(JSON.stringify(res.body), `${who.name} ${url}`).not.toMatch(/oneGo|OneGo|one go/);
      }
    }
  });

  it("an admin gets 403", async () => {
    const { project } = await setup();
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const res = await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(admin));
    expect(res.status).toBe(403);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

// A rename shows at display time, by member id, in every place the stored snapshot names someone. Stored rows
// are never changed, and the server-only narrativeNames record never leaves the server.
const app = createApp();

const doc = (userId: number, name: string, share: number, flags: string[] = []) => ({
  studentName: name, githubUsername: "", userId, sessionCount: 3, activeDays: 2, retainedChars: 500, totalInsertedChars: 600,
  selfChurnRatio: 0, insertedImageCount: 0, contributionShare: share, flags,
});

async function setup(opts: { withNames?: boolean; narrativeAt?: string } = {}) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id, groupName: "Group Names" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Christian Lenizo" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Benedict Cruz" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id, "MEMBER");
  const content = {
    report: { members: [doc(leader.id, "Christian Lenizo", 0.7), doc(ben.id, "Benedict Cruz", 0.3)], memberCount: 2, gini: 0.2, teamHealth: "Moderate Risk" },
    narrative: "Christian Lenizo wrote most of the document. Benedict Cruz added sections.",
    narrativeAt: opts.narrativeAt ?? new Date().toISOString(),
    ...(opts.withNames === false ? {} : { narrativeNames: [{ userId: leader.id, name: "Christian Lenizo" }, { userId: ben.id, name: "Benedict Cruz" }] }),
  };
  const report = await prisma.report.create({ data: { projectId: project.id, gini: 0.2, teamHealth: "Moderate Risk", content: JSON.stringify(content) } });
  return { instructor, project, leader, ben, report };
}

const rename = (id: number, name: string) => prisma.user.update({ where: { id }, data: { name } });

describe("current names at display time", () => {
  it("instructor report: members and narrative show the new name; the stored row and narrativeNames stay hidden", async () => {
    const s = await setup();
    await rename(s.leader.id, "Christian Gwapo");
    const res = await request(app).get(`/api/projects/${s.project.id}/report`).set("Authorization", authHeaderFor(s.instructor));
    expect(res.status).toBe(200);
    expect(res.body.report.members.map((m: { studentName: string }) => m.studentName)).toEqual(["Christian Gwapo", "Benedict Cruz"]);
    expect(res.body.narrative).toBe("Christian Gwapo wrote most of the document. Benedict Cruz added sections.");
    expect(JSON.stringify(res.body)).not.toContain("narrativeNames");
    const row = await prisma.report.findUniqueOrThrow({ where: { id: s.report.id } });
    expect(row.content).toContain("Christian Lenizo");
    expect(row.content).not.toContain("Christian Gwapo");
  });

  it("no change when names are the same", async () => {
    const s = await setup();
    const res = await request(app).get(`/api/projects/${s.project.id}/report`).set("Authorization", authHeaderFor(s.instructor));
    expect(res.body.narrative).toBe("Christian Lenizo wrote most of the document. Benedict Cruz added sections.");
  });

  it("two members who share a name: the text is not swapped", async () => {
    const s = await setup();
    await rename(s.ben.id, "Sam");
    await rename(s.leader.id, "Sam");
    const res = await request(app).get(`/api/projects/${s.project.id}/report`).set("Authorization", authHeaderFor(s.instructor));
    expect(res.body.narrative).toContain("Christian Lenizo");
    expect(res.body.narrative).toContain("Benedict Cruz");
  });

  it("a deleted account keeps its stored text and 'Former member'", async () => {
    const s = await setup();
    await prisma.user.update({ where: { id: s.ben.id }, data: { name: "Former member", deletedAt: new Date() } });
    const res = await request(app).get(`/api/projects/${s.project.id}/report`).set("Authorization", authHeaderFor(s.instructor));
    expect(res.body.report.members[1].studentName).toBe("Benedict Cruz");
    expect(res.body.narrative).toContain("Benedict Cruz");
  });

  it("legacy narrative without narrativeNames: the report row it was written on gives the old name", async () => {
    const s = await setup({ withNames: false });
    await rename(s.leader.id, "Christian Gwapo");
    const res = await request(app).get(`/api/projects/${s.project.id}/report`).set("Authorization", authHeaderFor(s.instructor));
    expect(res.body.narrative).toContain("Christian Gwapo wrote");
  });

  it("evidence report (leader) and verify (instructor) show the new name", async () => {
    const s = await setup();
    await rename(s.leader.id, "Christian Gwapo");
    const ev = await request(app).get(`/api/groups/${s.project.id}/evidence-report`).set("Authorization", authHeaderFor(s.leader));
    expect(ev.status).toBe(200);
    expect(ev.body.members.map((m: { name: string }) => m.name)).toContain("Christian Gwapo");
    expect(ev.body.members.map((m: { name: string }) => m.name)).not.toContain("Christian Lenizo");
    expect(JSON.stringify(ev.body)).not.toContain("narrativeNames");
    const ver = await request(app).post("/api/evidence-reports/verify").set("Authorization", authHeaderFor(s.instructor)).send({ code: ev.body.reportId });
    expect(ver.status).toBe(200);
    expect(ver.body.members.map((m: { name: string }) => m.name)).toContain("Christian Gwapo");
  });

  it("student group: the leader's narrative has the new name; a plain member gets no names and no new field", async () => {
    const s = await setup();
    await rename(s.leader.id, "Christian Gwapo");
    const lead = await request(app).get(`/api/student/group/${s.project.id}`).set("Authorization", authHeaderFor(s.leader));
    expect(lead.status).toBe(200);
    expect(String(lead.body.report.narrative)).toContain("Christian Gwapo");
    expect(String(lead.body.report.narrative)).not.toContain("Christian Lenizo");
    expect(JSON.stringify(lead.body)).not.toContain("narrativeNames");
    const mem = await request(app).get(`/api/student/group/${s.project.id}`).set("Authorization", authHeaderFor(s.ben));
    expect(mem.status).toBe(200);
    const text = JSON.stringify(mem.body);
    expect(text).not.toContain("narrativeNames");
    expect(text).not.toContain("Christian");
    expect(mem.body.report.narrative).toBeUndefined();
  });

  it("the privacy export never carries narrativeNames", async () => {
    const s = await setup();
    const res = await request(app).get("/api/privacy/export").set("Authorization", authHeaderFor(s.leader));
    expect(JSON.stringify(res.body)).not.toContain("narrativeNames");
  });
});

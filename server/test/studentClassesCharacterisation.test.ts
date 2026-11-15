// Characterisation of GET /api/student/classes and GET /api/student/classes/:id/projects.
// Written against the code BEFORE the E1d-1 query slimming and must stay green, unedited, after it:
// the expected bodies are built by hand from the seeded rows (never from the route), and compared as
// text so key order and every value are checked byte for byte.
import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createProject, createMembership } from "./factories.js";

const app = createApp();
let code = 0;

async function assignment(classSectionId: number, o: { title: string; sourceType: "GITHUB" | "EDITOR" | "COMBINED"; createdAt: Date; deadline?: Date | null; maxGroupSize?: number; description?: string | null }) {
  code += 1;
  return prisma.assignment.create({
    data: {
      classSectionId, title: o.title, sourceType: o.sourceType, joinCode: `CHR${Date.now()}${code}`,
      createdAt: o.createdAt, deadline: o.deadline ?? null, maxGroupSize: o.maxGroupSize ?? 5, description: o.description ?? null,
    },
  });
}

const noActivityContent = JSON.stringify({ report: { members: [{ contributionShare: 0 }, { contributionShare: 0 }] } });
const activeContent = JSON.stringify({ report: { members: [{ contributionShare: 0.6 }, { contributionShare: 0.4 }] } });

async function world() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: s } = await createUser({ systemRole: "STUDENT", name: "Student S" });
  const { user: x } = await createUser({ systemRole: "STUDENT", name: "Leader X" });
  const { user: y } = await createUser({ systemRole: "STUDENT", name: "Leader Y" });
  const { user: p1 } = await createUser({ systemRole: "STUDENT" });
  const { user: p2 } = await createUser({ systemRole: "STUDENT" });
  const { user: p3 } = await createUser({ systemRole: "STUDENT" });

  const c1 = await createClassSection(instructor.id);
  const c2 = await createClassSection(instructor.id);
  await prisma.classEnrollment.create({ data: { userId: s.id, classSectionId: c2.id, joinedAt: new Date("2026-09-02T00:00:00Z") } });
  await prisma.classEnrollment.create({ data: { userId: s.id, classSectionId: c1.id, joinedAt: new Date("2026-09-01T00:00:00Z") } });

  // Created out of order on purpose: the route orders by createdAt.
  const a2 = await assignment(c1.id, { title: "Writing", sourceType: "EDITOR", createdAt: new Date("2026-09-11T00:00:00Z") });
  const a1 = await assignment(c1.id, { title: "Build", sourceType: "GITHUB", createdAt: new Date("2026-09-10T00:00:00Z"), deadline: new Date("2026-12-01T10:00:00Z"), maxGroupSize: 2, description: "Do the thing" });
  const a3 = await assignment(c2.id, { title: "Other class", sourceType: "COMBINED", createdAt: new Date("2026-09-12T00:00:00Z") });

  // Attachments on a1, stored out of order: ordered by (order, id).
  const att2 = await prisma.projectAttachment.create({ data: { assignmentId: a1.id, kind: "PDF", mime: "application/pdf", data: Buffer.from("b"), size: 1, filename: "b.pdf", order: 1 } });
  const att1 = await prisma.projectAttachment.create({ data: { assignmentId: a1.id, kind: "IMAGE", mime: "image/png", data: Buffer.from("a"), size: 1, filename: "a.png", order: 0 } });

  // a1: g1 (S leader, 2 members, three reports incl. a generatedAt tie), g2 (X leader), g3 (empty).
  const g1 = await createProject({ assignmentId: a1.id, groupName: "Alpha" });
  const g2 = await createProject({ assignmentId: a1.id, groupName: "" });
  const g3 = await createProject({ assignmentId: a1.id, groupName: "Gamma", repoUrl: null });
  await createMembership(s.id, g1.id, "LEADER");
  await createMembership(p3.id, g1.id, "MEMBER");
  await createMembership(x.id, g2.id, "LEADER");
  await prisma.member.createMany({ data: [{ projectId: g1.id, studentName: "a", githubUsername: "a" }, { projectId: g1.id, studentName: "b", githubUsername: "b" }, { projectId: g2.id, studentName: "c", githubUsername: "c" }] });
  const tie = new Date("2026-11-05T00:00:00Z");
  await prisma.report.create({ data: { projectId: g1.id, teamHealth: "High Risk", content: activeContent, generatedAt: new Date("2026-11-01T00:00:00Z") } });
  await prisma.report.create({ data: { projectId: g1.id, teamHealth: "Moderate Risk", content: activeContent, generatedAt: tie } });
  await prisma.report.create({ data: { projectId: g1.id, teamHealth: "Healthy", content: noActivityContent, generatedAt: tie } }); // higher id wins the tie
  await prisma.report.create({ data: { projectId: g2.id, teamHealth: "High Risk", content: activeContent } }); // another group's report: never shown to S
  // Pending requests into g1 (S is its leader): p1, p2 pending, p3 declined (not counted).
  await prisma.groupJoinRequest.create({ data: { userId: p1.id, projectId: g1.id, status: "PENDING" } });
  await prisma.groupJoinRequest.create({ data: { userId: p2.id, projectId: g1.id, status: "PENDING" } });
  await prisma.groupJoinRequest.create({ data: { userId: p3.id, projectId: g1.id, status: "DECLINED" } });

  // a2: S is in no group; one DECLINED (older) to g4 and one PENDING to g5 -> pending wins.
  const g4 = await createProject({ assignmentId: a2.id, groupName: "Delta" });
  const g5 = await createProject({ assignmentId: a2.id, groupName: "" });
  await createMembership(x.id, g4.id, "LEADER");
  await createMembership(y.id, g5.id, "LEADER");
  await prisma.member.createMany({ data: [{ projectId: g4.id, studentName: "d", githubUsername: "d" }, { projectId: g5.id, studentName: "e", githubUsername: "e" }] });
  const rDeclined = await prisma.groupJoinRequest.create({ data: { userId: s.id, projectId: g4.id, status: "DECLINED", createdAt: new Date("2026-10-01T00:00:00Z") } });
  const rPending = await prisma.groupJoinRequest.create({ data: { userId: s.id, projectId: g5.id, status: "PENDING", createdAt: new Date("2026-10-02T00:00:00Z") } });

  // a3 (class 2): S is a plain member; its only report has no health label and no content.
  const g6 = await createProject({ assignmentId: a3.id, groupName: "Zeta" });
  await createMembership(s.id, g6.id, "MEMBER");
  await createMembership(y.id, g6.id, "LEADER");
  await prisma.report.create({ data: { projectId: g6.id, teamHealth: null, content: null, generatedAt: new Date("2026-11-03T00:00:00Z") } });

  const dep = await prisma.department.findUniqueOrThrow({ where: { id: c1.departmentId }, select: { id: true, name: true, code: true } });
  const latestG1 = await prisma.report.findFirstOrThrow({ where: { projectId: g1.id }, orderBy: [{ generatedAt: "desc" }, { id: "desc" }] });
  return { s, x, y, p3, c1, c2, a1, a2, a3, g1, g2, g3, g4, g5, g6, att1, att2, rDeclined, rPending, dep, latestG1 };
}

const get = (url: string, user: Parameters<typeof authHeaderFor>[0]) => request(app).get(url).set("Authorization", authHeaderFor(user));

describe("GET /api/student/classes (characterisation)", () => {
  it("a student with no classes gets an empty list", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const res = await get("/api/student/classes", user);
    expect(res.status).toBe(200);
    expect(res.text).toBe(JSON.stringify({ classes: [] }));
  });

  it("returns classes by joinedAt, assignments by createdAt, own group and its latest report only", async () => {
    const w = await world();
    const res = await get("/api/student/classes", w.s);
    expect(res.status).toBe(200);
    const cls = (c: typeof w.c1, joinedAt: string, assignments: unknown[]) => ({
      id: c.id, subjectCode: c.subjectCode, subjectName: c.subjectName, department: w.dep, edpCode: c.edpCode, joinCode: c.joinCode, joinedAt, assignments,
    });
    const expected = {
      classes: [
        cls(w.c1, "2026-09-01T00:00:00.000Z", [
          {
            id: w.a1.id, title: "Build", deadline: "2026-12-01T10:00:00.000Z", sourceType: "GITHUB", maxGroupSize: 2,
            myGroup: { id: w.g1.id, groupName: "Alpha", repoUrl: "https://github.com/example/repo", role: "LEADER", report: { evenness: "even", generatedAt: "2026-11-05T00:00:00.000Z", noActivity: true } },
          },
          { id: w.a2.id, title: "Writing", deadline: null, sourceType: "EDITOR", maxGroupSize: 5, myGroup: null },
        ]),
        cls(w.c2, "2026-09-02T00:00:00.000Z", [
          {
            id: w.a3.id, title: "Other class", deadline: null, sourceType: "COMBINED", maxGroupSize: 5,
            myGroup: { id: w.g6.id, groupName: "Zeta", repoUrl: "https://github.com/example/repo", role: "MEMBER", report: { evenness: null, generatedAt: "2026-11-03T00:00:00.000Z", noActivity: false } },
          },
        ]),
      ],
    };
    expect(w.latestG1.teamHealth).toBe("Healthy"); // the tie really is broken by the higher id
    expect(res.text).toBe(JSON.stringify(expected));
  });

  it("a group with no report has report: null, and a null repo stays null", async () => {
    const { user: s } = await createUser({ systemRole: "STUDENT" });
    const { user: inst } = await createUser({ systemRole: "INSTRUCTOR" });
    const c = await createClassSection(inst.id);
    await prisma.classEnrollment.create({ data: { userId: s.id, classSectionId: c.id, joinedAt: new Date("2026-09-01T00:00:00Z") } });
    const a = await assignment(c.id, { title: "T", sourceType: "EDITOR", createdAt: new Date("2026-09-10T00:00:00Z") });
    const g = await createProject({ assignmentId: a.id, groupName: "", repoUrl: null });
    await createMembership(s.id, g.id, "MEMBER");
    const dep = await prisma.department.findUniqueOrThrow({ where: { id: c.departmentId }, select: { id: true, name: true, code: true } });
    const res = await get("/api/student/classes", s);
    expect(res.text).toBe(JSON.stringify({
      classes: [{
        id: c.id, subjectCode: c.subjectCode, subjectName: c.subjectName, department: dep, edpCode: c.edpCode, joinCode: c.joinCode, joinedAt: "2026-09-01T00:00:00.000Z",
        assignments: [{ id: a.id, title: "T", deadline: null, sourceType: "EDITOR", maxGroupSize: 5, myGroup: { id: g.id, groupName: `Group ${g.id}`, repoUrl: null, role: "MEMBER", report: null } }],
      }],
    }));
  });

  it("only students may call it", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR" });
    expect((await get("/api/student/classes", user)).status).toBe(403);
  });
});

describe("GET /api/student/classes/:id/projects (characterisation)", () => {
  it("returns every assignment with own group, pending count, relevant request, attachments and joinable groups", async () => {
    const w = await world();
    const res = await get(`/api/student/classes/${w.c1.id}/projects`, w.s);
    expect(res.status).toBe(200);
    const expected = {
      classSection: { id: w.c1.id, subjectCode: w.c1.subjectCode, subjectName: w.c1.subjectName, department: w.dep, edpCode: w.c1.edpCode, joinCode: w.c1.joinCode },
      assignments: [
        {
          id: w.a1.id, title: "Build", deadline: "2026-12-01T10:00:00.000Z", sourceType: "GITHUB", maxGroupSize: 2, description: "Do the thing",
          attachments: [
            { id: w.att1.id, kind: "IMAGE", mime: "image/png", filename: "a.png", size: 1, order: 0 },
            { id: w.att2.id, kind: "PDF", mime: "application/pdf", filename: "b.pdf", size: 1, order: 1 },
          ],
          myGroup: {
            id: w.g1.id, groupName: "Alpha", repoUrl: "https://github.com/example/repo", role: "LEADER", pendingRequestCount: 2,
            report: { evenness: "even", generatedAt: "2026-11-05T00:00:00.000Z", noActivity: true },
          },
          myRequest: null,
          groups: [
            { id: w.g1.id, groupName: "Alpha", memberCount: 2, leaderName: "Student S", isFull: true },
            { id: w.g2.id, groupName: `Group ${w.g2.id}`, memberCount: 1, leaderName: "Leader X", isFull: false },
            { id: w.g3.id, groupName: "Gamma", memberCount: 0, leaderName: null, isFull: false },
          ],
        },
        {
          id: w.a2.id, title: "Writing", deadline: null, sourceType: "EDITOR", maxGroupSize: 5, description: null, attachments: [],
          myGroup: null,
          myRequest: { id: w.rPending.id, projectId: w.g5.id, groupName: `Group ${w.g5.id}`, status: "PENDING", createdAt: "2026-10-02T00:00:00.000Z" },
          groups: [
            { id: w.g4.id, groupName: "Delta", memberCount: 1, leaderName: "Leader X", isFull: false },
            { id: w.g5.id, groupName: `Group ${w.g5.id}`, memberCount: 1, leaderName: "Leader Y", isFull: false },
          ],
        },
      ],
    };
    expect(res.text).toBe(JSON.stringify(expected));
  });

  it("with only a DECLINED request, that request is shown", async () => {
    const w = await world();
    await prisma.groupJoinRequest.delete({ where: { id: w.rPending.id } });
    const res = await get(`/api/student/classes/${w.c1.id}/projects`, w.s);
    expect(res.body.assignments[1].myRequest).toEqual({
      id: w.rDeclined.id, projectId: w.g4.id, groupName: "Delta", status: "DECLINED", createdAt: "2026-10-01T00:00:00.000Z",
    });
  });

  it("a plain member sees pendingRequestCount 0 and report null/health null as before", async () => {
    const w = await world();
    const res = await get(`/api/student/classes/${w.c2.id}/projects`, w.s);
    expect(res.status).toBe(200);
    expect(res.body.assignments).toHaveLength(1);
    expect(res.text).toContain(`"pendingRequestCount":0`);
    expect(res.body.assignments[0].myGroup.report).toEqual({ evenness: null, generatedAt: "2026-11-03T00:00:00.000Z", noActivity: false });
  });

  it("a class with no assignments returns an empty list", async () => {
    const { user: s } = await createUser({ systemRole: "STUDENT" });
    const { user: inst } = await createUser({ systemRole: "INSTRUCTOR" });
    const c = await createClassSection(inst.id);
    await prisma.classEnrollment.create({ data: { userId: s.id, classSectionId: c.id } });
    const res = await get(`/api/student/classes/${c.id}/projects`, s);
    expect(res.status).toBe(200);
    expect(res.body.assignments).toEqual([]);
  });

  it("403 when not enrolled, 400 for a bad id, 404 is unreachable without enrollment", async () => {
    const w = await world();
    const { user: other } = await createUser({ systemRole: "STUDENT" });
    expect((await get(`/api/student/classes/${w.c1.id}/projects`, other)).status).toBe(403);
    expect((await get(`/api/student/classes/abc/projects`, w.s)).status).toBe(400);
  });
});

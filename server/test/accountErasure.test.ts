import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

const NAME = "Juan Dela Cruz";
const EMAIL = "juan.delacruz@uclm.edu.ph";
const LOGIN = "jdelacruz";

// A group with an erasable member ("Juan"), a teammate and a stored report naming both.
async function seedGroup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const cs = await createClassSection(instructor.id);
  const asgn = await createAssignment(cs.id, { sourceType: "COMBINED" });
  const project = await createProject({ assignmentId: asgn.id });

  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Maria Santos", email: "maria@uclm.edu.ph" });
  const { user: juan, password } = await createUser({ systemRole: "STUDENT", name: NAME, email: EMAIL });
  await prisma.user.update({ where: { id: juan.id }, data: { githubUsername: LOGIN } });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(juan.id, project.id);
  await prisma.member.createMany({
    data: [
      { projectId: project.id, studentName: "Maria Santos", githubUsername: "msantos" },
      { projectId: project.id, studentName: NAME, githubUsername: LOGIN },
    ],
  });

  const content = {
    report: {
      gini: 0.2, teamHealth: "Moderate Risk", memberCount: 2,
      members: [
        { studentName: "Maria Santos", githubUsername: "msantos", userId: leader.id, contributionShare: 0.55, commits: 9, flags: [] },
        { studentName: NAME, githubUsername: LOGIN, userId: juan.id, contributionShare: 0.45, commits: 7, flags: [] },
      ],
    },
    narrative: `${NAME} (${LOGIN}) contributed 45%. Maria Santos contributed 55%.`,
  };
  const report = await prisma.report.create({ data: { projectId: project.id, gini: 0.2, teamHealth: "Moderate Risk", content: JSON.stringify(content) } });

  // The rows that used to make the admin delete fail on a Restrict FK.
  const doc = await prisma.document.create({ data: { groupId: project.id } });
  await prisma.editEvent.create({ data: { documentId: doc.id, userId: juan.id, eventType: "INSERT", position: 0, length: 5, insertedText: "hello" } });
  await prisma.editSession.create({ data: { documentId: doc.id, userId: juan.id, characterCount: 5 } });
  await prisma.comment.create({ data: { documentId: doc.id, authorId: juan.id, text: "a comment", anchor: Buffer.from([1]) } });
  await prisma.task.create({ data: { projectId: project.id, title: "Slides", createdByUserId: leader.id, assignedToUserId: juan.id } });
  await prisma.dispute.create({ data: { projectId: project.id, studentUserId: juan.id, memberName: NAME, reason: "please review" } });

  return { admin, instructor, leader, juan, password, project, report };
}

async function memberScores(reportId: number) {
  const row = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
  const parsed = JSON.parse(row.content!) as { report: { gini: number; teamHealth: string; members: Array<{ userId: number; contributionShare: number; commits: number; flags: string[] }> } };
  return {
    gini: parsed.report.gini,
    teamHealth: parsed.report.teamHealth,
    members: parsed.report.members.map((m) => ({ userId: m.userId, contributionShare: m.contributionShare, commits: m.commits, flags: m.flags })),
  };
}

describe("deletion request flow", () => {
  it("files one pending request at a time and notifies admins", async () => {
    const { admin, juan } = await seedGroup();
    const first = await request(app).post("/api/privacy/deletion-request").set("Authorization", authHeaderFor(juan)).send({ reason: "leaving" });
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/privacy/deletion-request").set("Authorization", authHeaderFor(juan)).send({});
    expect(second.status).toBe(409);

    expect(await prisma.alert.count({ where: { recipientId: admin.id, type: "DELETION_REQUESTED" } })).toBe(1);

    const list = await request(app).get("/api/admin/deletion-requests").set("Authorization", authHeaderFor(admin));
    expect(list.status).toBe(200);
    expect(list.body.pendingCount).toBe(1);
  });

  it("lets the user cancel their own pending request", async () => {
    const { juan } = await seedGroup();
    await request(app).post("/api/privacy/deletion-request").set("Authorization", authHeaderFor(juan)).send({});
    const res = await request(app).delete("/api/privacy/deletion-request").set("Authorization", authHeaderFor(juan));
    expect(res.status).toBe(200);
    expect((await prisma.deletionRequest.findFirst({ where: { userId: juan.id } }))?.status).toBe("CANCELLED");
  });

  it("only an admin can review", async () => {
    const { juan, instructor } = await seedGroup();
    const created = await request(app).post("/api/privacy/deletion-request").set("Authorization", authHeaderFor(juan)).send({});
    const id = created.body.request.id as number;
    expect((await request(app).post(`/api/admin/deletion-requests/${id}/approve`).set("Authorization", authHeaderFor(juan))).status).toBe(403);
    expect((await request(app).post(`/api/admin/deletion-requests/${id}/approve`).set("Authorization", authHeaderFor(instructor))).status).toBe(403);
  });

  it("rejecting leaves the account untouched and tells the user", async () => {
    const { admin, juan } = await seedGroup();
    const created = await request(app).post("/api/privacy/deletion-request").set("Authorization", authHeaderFor(juan)).send({});
    const id = created.body.request.id as number;
    const res = await request(app).post(`/api/admin/deletion-requests/${id}/reject`).set("Authorization", authHeaderFor(admin)).send({ note: "Talk to your instructor" });
    expect(res.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: juan.id } });
    expect(row.name).toBe(NAME);
    expect(row.deletedAt).toBeNull();
    expect(await prisma.alert.count({ where: { recipientId: juan.id, type: "DELETION_REJECTED" } })).toBe(1);
  });

  it("approval anonymizes the account and keeps teammates' reports intact", async () => {
    const { admin, juan, leader, project, report, password } = await seedGroup();
    const before = await memberScores(report.id);
    const oldAuth = authHeaderFor(juan);

    const created = await request(app).post("/api/privacy/deletion-request").set("Authorization", oldAuth).send({});
    const id = created.body.request.id as number;
    const res = await request(app).post(`/api/admin/deletion-requests/${id}/approve`).set("Authorization", authHeaderFor(admin));
    expect(res.status).toBe(200);

    // Tombstone: identity gone, row kept.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: juan.id } });
    expect(row.name).toBe("Former member");
    expect(row.email).toBe(`deleted-${juan.id}@deleted.invalid`);
    expect(row.githubUsername).toBeNull();
    expect(row.avatarData).toBeNull();
    expect(row.active).toBe(false);
    expect(row.deletedAt).toBeInstanceOf(Date);

    // Sessions end immediately: the still-unexpired access token and the old credentials are dead.
    expect((await request(app).get("/api/student/classes").set("Authorization", oldAuth)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: EMAIL, password })).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: juan.id } })).toBe(0);

    // Teammate-facing data: same numbers, no identity.
    const after = await memberScores(report.id);
    expect(after).toEqual(before);
    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    for (const s of [NAME, EMAIL, LOGIN]) expect(stored.content).not.toContain(s);
    expect(stored.content).toContain("Maria Santos");
    expect(stored.content).toContain("Former member");

    const members = await prisma.member.findMany({ where: { projectId: project.id }, orderBy: { id: "asc" } });
    expect(members.map((m) => m.studentName)).toEqual(["Maria Santos", "Former member"]);
    expect(members[1]!.githubUsername).toBe("");

    // Contribution rows stay (now attributed to the tombstone).
    expect(await prisma.editEvent.count({ where: { userId: juan.id } })).toBe(1);
    expect(await prisma.editSession.count({ where: { userId: juan.id } })).toBe(1);
    expect(await prisma.groupMembership.count({ where: { projectId: project.id } })).toBe(2);
    expect(await prisma.dispute.count({ where: { studentUserId: juan.id } })).toBe(0);
    expect(leader.id).toBeGreaterThan(0);

    // Audit trail keeps id/action/time, never the name or email.
    const logs = await prisma.auditLog.findMany({ where: { targetId: String(juan.id) } });
    expect(logs.some((l) => l.action === "ACCOUNT_ERASURE_APPROVED")).toBe(true);
    for (const l of logs) {
      expect(`${l.actorName} ${l.details ?? ""}`).not.toContain(NAME);
      expect(`${l.actorName} ${l.details ?? ""}`).not.toContain(EMAIL);
    }
    expect((await prisma.deletionRequest.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
  });

  it("blocks erasing a group leader or an instructor who owns classes", async () => {
    const { admin, leader, instructor } = await seedGroup();
    for (const target of [leader, instructor]) {
      const created = await request(app).post("/api/privacy/deletion-request").set("Authorization", authHeaderFor(target)).send({});
      const res = await request(app).post(`/api/admin/deletion-requests/${created.body.request.id}/approve`).set("Authorization", authHeaderFor(admin));
      expect(res.status).toBe(409);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).deletedAt).toBeNull();
    }
  });
});

describe("DELETE /api/admin/users/:id (now anonymizes)", () => {
  it("succeeds for a student with edit events, tasks and comments, and teammates' scores are unchanged", async () => {
    const { admin, juan, report } = await seedGroup();
    const before = await memberScores(report.id);

    const res = await request(app).delete(`/api/admin/users/${juan.id}`).set("Authorization", authHeaderFor(admin));
    expect(res.status).toBe(200);

    expect(await memberScores(report.id)).toEqual(before);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: juan.id } });
    expect(row.name).toBe("Former member");
    expect(await prisma.task.count({ where: { assignedToUserId: juan.id } })).toBe(1);
    expect(await prisma.comment.count({ where: { authorId: juan.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "USER_DELETED", targetId: String(juan.id) } })).toBe(1);
  });
});

describe("deactivated accounts lose access immediately", () => {
  it("rejects an unexpired access token once the account is deactivated", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const auth = authHeaderFor(user);
    expect((await request(app).get("/api/student/classes").set("Authorization", auth)).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    const res = await request(app).get("/api/student/classes").set("Authorization", auth);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_UNAVAILABLE");
  });
});

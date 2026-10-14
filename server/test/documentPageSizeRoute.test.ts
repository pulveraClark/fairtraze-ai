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

// documents.ts PATCH/GET /document/page-size — the per-document paper size shared by all
// collaborators. A plain column write: it must never create EditEvents/sessions or Alerts, and must
// never mark an analysis outdated (Project.membershipChangedAt / scoringConfigChangedAt).
describe("document page size routes", () => {
  async function setup(sourceType: "EDITOR" | "GITHUB" = "EDITOR") {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: leader } = await createUser({ systemRole: "STUDENT" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(leader.id, project.id, "LEADER");
    await createMembership(member.id, project.id, "MEMBER");
    const doc = await prisma.document.create({ data: { groupId: project.id } });
    return { instructor, leader, member, project, doc };
  }

  it("defaults to SHORT and returns it from GET /document and /document/page-size", async () => {
    const { member, project } = await setup();
    const auth = authHeaderFor(member);
    expect((await request(app).get(`/api/groups/${project.id}/document`).set("Authorization", auth)).body.pageSize).toBe("SHORT");
    expect((await request(app).get(`/api/groups/${project.id}/document/page-size`).set("Authorization", auth)).body.pageSize).toBe("SHORT");
  });

  it("lets any group member set LONG / A4 / SHORT, shared with every collaborator", async () => {
    const { leader, member, project } = await setup();
    for (const size of ["LONG", "A4", "SHORT"] as const) {
      const res = await request(app)
        .patch(`/api/groups/${project.id}/document/page-size`)
        .set("Authorization", authHeaderFor(member))
        .send({ pageSize: size });
      expect(res.status).toBe(200);
      expect(res.body.pageSize).toBe(size);
      const seen = await request(app).get(`/api/groups/${project.id}/document/page-size`).set("Authorization", authHeaderFor(leader));
      expect(seen.body.pageSize).toBe(size);
    }
  });

  it("rejects invalid sizes with 400", async () => {
    const { member, project } = await setup();
    for (const bad of ["LEGAL", "short", "", 7, null]) {
      const res = await request(app)
        .patch(`/api/groups/${project.id}/document/page-size`)
        .set("Authorization", authHeaderFor(member))
        .send({ pageSize: bad });
      expect(res.status).toBe(400);
    }
  });

  it("rejects non-members and the (read-only) instructor with 403, but lets the instructor read it", async () => {
    const { instructor, project } = await setup();
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    for (const u of [instructor, outsider]) {
      const res = await request(app)
        .patch(`/api/groups/${project.id}/document/page-size`)
        .set("Authorization", authHeaderFor(u))
        .send({ pageSize: "A4" });
      expect(res.status).toBe(403);
    }
    const read = await request(app).get(`/api/groups/${project.id}/document/page-size`).set("Authorization", authHeaderFor(instructor));
    expect(read.status).toBe(200);
    expect((await request(app).get(`/api/groups/${project.id}/document/page-size`).set("Authorization", authHeaderFor(outsider))).status).toBe(403);
  });

  it("rejects GITHUB-only assignments", async () => {
    const { member, project } = await setup("GITHUB");
    const res = await request(app)
      .patch(`/api/groups/${project.id}/document/page-size`)
      .set("Authorization", authHeaderFor(member))
      .send({ pageSize: "A4" });
    expect(res.status).toBe(403);
  });

  it("does not create the Document row (so the template picker is never skipped)", async () => {
    const { member, project, doc } = await setup();
    await prisma.document.delete({ where: { id: doc.id } });
    const res = await request(app)
      .patch(`/api/groups/${project.id}/document/page-size`)
      .set("Authorization", authHeaderFor(member))
      .send({ pageSize: "A4" });
    expect(res.status).toBe(404);
    expect(await prisma.document.findUnique({ where: { groupId: project.id } })).toBeNull();
    const read = await request(app).get(`/api/groups/${project.id}/document/page-size`).set("Authorization", authHeaderFor(member));
    expect(read.body.pageSize).toBe("SHORT");
    expect(await prisma.document.findUnique({ where: { groupId: project.id } })).toBeNull();
  });

  it("creates no EditEvent/EditSession/Alert and does not mark the analysis outdated", async () => {
    const { member, project, doc } = await setup();
    const before = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const yjsBefore = (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).yjsState;

    await request(app)
      .patch(`/api/groups/${project.id}/document/page-size`)
      .set("Authorization", authHeaderFor(member))
      .send({ pageSize: "LONG" })
      .expect(200);

    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.membershipChangedAt).toEqual(before.membershipChangedAt);
    expect(after.scoringConfigChangedAt).toEqual(before.scoringConfigChangedAt);
    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(0);
    expect(await prisma.editSession.count({ where: { documentId: doc.id } })).toBe(0);
    expect(await prisma.alert.count()).toBe(0);
    const yjsAfter = (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).yjsState;
    expect(yjsAfter).toEqual(yjsBefore);
  });
});

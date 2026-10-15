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

// documents.ts GET/PATCH /document/page-setup - paper, orientation, margins and the plain-text
// header/footer, shared by all collaborators. Plain column writes: they must never create
// EditEvents/sessions or Alerts, and must never mark an analysis outdated.
describe("document page setup routes", () => {
  async function setup(sourceType: "EDITOR" | "GITHUB" | "COMBINED" = "EDITOR") {
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
  const url = (id: number) => `/api/groups/${id}/document/page-setup`;

  it("defaults reproduce the previous behaviour: Short, portrait, 1in margins, no header or footer", async () => {
    const { member, project } = await setup();
    const res = await request(app).get(url(project.id)).set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      pageSize: "SHORT",
      orientation: "PORTRAIT",
      marginPreset: "NORMAL",
      header: { left: "", center: "", right: "" },
      footer: { left: "", center: "", right: "" },
    });
    // GET /document carries it too.
    const doc = await request(app).get(`/api/groups/${project.id}/document`).set("Authorization", authHeaderFor(member));
    expect(doc.body.pageSetup).toEqual(res.body);
    expect(doc.body.pageSize).toBe("SHORT");
  });

  it("lets any member change any subset, shared with every collaborator", async () => {
    const { leader, member, project } = await setup();
    const patch = await request(app)
      .patch(url(project.id))
      .set("Authorization", authHeaderFor(member))
      .send({ pageSize: "A4", orientation: "LANDSCAPE", marginPreset: "WIDE" });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ pageSize: "A4", orientation: "LANDSCAPE", marginPreset: "WIDE" });
    const seen = await request(app).get(url(project.id)).set("Authorization", authHeaderFor(leader));
    expect(seen.body).toMatchObject({ pageSize: "A4", orientation: "LANDSCAPE", marginPreset: "WIDE" });

    // Changing one thing keeps the rest.
    await request(app).patch(url(project.id)).set("Authorization", authHeaderFor(leader)).send({ marginPreset: "NARROW" }).expect(200);
    const after = await request(app).get(url(project.id)).set("Authorization", authHeaderFor(member));
    expect(after.body).toMatchObject({ pageSize: "A4", orientation: "LANDSCAPE", marginPreset: "NARROW" });
  });

  it("stores header/footer text per slot and merges partial updates", async () => {
    const { member, project } = await setup();
    const auth = authHeaderFor(member);
    await request(app)
      .patch(url(project.id))
      .set("Authorization", auth)
      .send({ header: { left: "Group 4", center: "Title" }, footer: { center: "Page {page}" } })
      .expect(200);
    const res = await request(app).patch(url(project.id)).set("Authorization", auth).send({ header: { right: "Draft" } });
    expect(res.status).toBe(200);
    expect(res.body.header).toEqual({ left: "Group 4", center: "Title", right: "Draft" });
    expect(res.body.footer).toEqual({ left: "", center: "Page {page}", right: "" });
    // Clearing a slot is an empty string.
    const cleared = await request(app).patch(url(project.id)).set("Authorization", auth).send({ header: { center: "" } });
    expect(cleared.body.header.center).toBe("");
    expect(cleared.body.header.left).toBe("Group 4");
  });

  it("stores header/footer text as typed: HTML is kept as plain text, control characters are stripped", async () => {
    const { member, project } = await setup();
    const res = await request(app)
      .patch(url(project.id))
      .set("Authorization", authHeaderFor(member))
      .send({ header: { left: '<b>bold</b> & "q"', center: "line1\nline2\u0000 x" } });
    expect(res.status).toBe(200);
    expect(res.body.header.left).toBe('<b>bold</b> & "q"'); // escaping happens at render time
    expect(res.body.header.center).toBe("line1line2x");
  });

  it("rejects over-long text, unknown keys, bad enums and empty bodies with 400", async () => {
    const { member, project } = await setup();
    const auth = authHeaderFor(member);
    const bad: unknown[] = [
      {},
      { pageSize: "LEGAL" },
      { orientation: "DIAGONAL" },
      { marginPreset: "HUGE" },
      { orientation: "portrait" },
      { header: { left: "x".repeat(121) } },
      { footer: { middle: "x" } },
      { header: "text" },
      { unknown: true },
      { pageSize: null },
    ];
    for (const body of bad) {
      const res = await request(app).patch(url(project.id)).set("Authorization", auth).send(body as object);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    // Exactly 120 is fine.
    await request(app).patch(url(project.id)).set("Authorization", auth).send({ header: { left: "x".repeat(120) } }).expect(200);
  });

  it("rejects non-members and the (read-only) instructor with 403, but lets the instructor read it", async () => {
    const { instructor, project } = await setup();
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    for (const u of [instructor, outsider]) {
      const res = await request(app).patch(url(project.id)).set("Authorization", authHeaderFor(u)).send({ orientation: "LANDSCAPE" });
      expect(res.status).toBe(403);
    }
    expect((await request(app).get(url(project.id)).set("Authorization", authHeaderFor(instructor))).status).toBe(200);
    expect((await request(app).get(url(project.id)).set("Authorization", authHeaderFor(outsider))).status).toBe(403);
  });

  it("works for COMBINED and rejects GITHUB-only assignments", async () => {
    const combined = await setup("COMBINED");
    await request(app).patch(url(combined.project.id)).set("Authorization", authHeaderFor(combined.member)).send({ orientation: "LANDSCAPE" }).expect(200);
    const github = await setup("GITHUB");
    const res = await request(app).patch(url(github.project.id)).set("Authorization", authHeaderFor(github.member)).send({ orientation: "LANDSCAPE" });
    expect(res.status).toBe(403);
  });

  it("does not create the Document row (so the template picker is never skipped)", async () => {
    const { member, project, doc } = await setup();
    await prisma.document.delete({ where: { id: doc.id } });
    const res = await request(app).patch(url(project.id)).set("Authorization", authHeaderFor(member)).send({ marginPreset: "NARROW" });
    expect(res.status).toBe(404);
    const read = await request(app).get(url(project.id)).set("Authorization", authHeaderFor(member));
    expect(read.body.marginPreset).toBe("NORMAL");
    expect(await prisma.document.findUnique({ where: { groupId: project.id } })).toBeNull();
  });

  it("the old page-size routes still work and see the same value", async () => {
    const { member, project } = await setup();
    await request(app).patch(`/api/groups/${project.id}/document/page-size`).set("Authorization", authHeaderFor(member)).send({ pageSize: "LONG" }).expect(200);
    expect((await request(app).get(url(project.id)).set("Authorization", authHeaderFor(member))).body.pageSize).toBe("LONG");
  });

  it("creates no EditEvent/EditSession/Alert, leaves the Yjs state alone and does not mark the analysis outdated", async () => {
    const { member, project, doc } = await setup();
    const before = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    const yjsBefore = (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).yjsState;
    const contentBefore = (await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).content;

    await request(app)
      .patch(url(project.id))
      .set("Authorization", authHeaderFor(member))
      .send({
        pageSize: "LONG",
        orientation: "LANDSCAPE",
        marginPreset: "WIDE",
        header: { left: "L", center: "C", right: "R" },
        footer: { center: "{page}" },
      })
      .expect(200);

    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.membershipChangedAt).toEqual(before.membershipChangedAt);
    expect(after.scoringConfigChangedAt).toEqual(before.scoringConfigChangedAt);
    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(0);
    expect(await prisma.editSession.count({ where: { documentId: doc.id } })).toBe(0);
    expect(await prisma.alert.count()).toBe(0);
    const docAfter = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(docAfter.yjsState).toEqual(yjsBefore);
    expect(docAfter.content).toBe(contentBefore);
  });
});

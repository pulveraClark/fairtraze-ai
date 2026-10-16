import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

// Custom margins on PATCH /document/page-setup: presets write their own four numbers (inches),
// CUSTOM stores the user's, and the final result must leave 2 in of writing space (same helper as
// the dialog: shared/src/pageSizes.ts validateMargins).
describe("document page setup: custom margins", () => {
  async function setup() {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id, "LEADER");
    const doc = await prisma.document.create({ data: { groupId: project.id } });
    return { member, project, doc };
  }
  const url = (id: number) => `/api/groups/${id}/document/page-setup`;
  const patch = (id: number, who: Parameters<typeof authHeaderFor>[0], body: object) =>
    request(app).patch(url(id)).set("Authorization", authHeaderFor(who)).send(body);

  it("a preset stores its own numbers", async () => {
    const { member, project, doc } = await setup();
    for (const [preset, m] of [
      ["NARROW", { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }],
      ["WIDE", { top: 1, bottom: 1, left: 2, right: 2 }],
      ["NORMAL", { top: 1, bottom: 1, left: 1, right: 1 }],
    ] as const) {
      const res = await patch(project.id, member, { marginPreset: preset });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ marginPreset: preset, margins: m });
      const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect([row.marginTop, row.marginBottom, row.marginLeft, row.marginRight]).toEqual([m.top, m.bottom, m.left, m.right]);
    }
  });

  it("ignores numbers sent together with a named preset", async () => {
    const { member, project } = await setup();
    const res = await patch(project.id, member, { marginPreset: "NARROW", marginTop: 3, marginLeft: 3 });
    expect(res.body).toMatchObject({ marginPreset: "NARROW", margins: { top: 0.5, left: 0.5 } });
  });

  it("CUSTOM stores the four values, shared with every collaborator", async () => {
    const { member, project } = await setup();
    const res = await patch(project.id, member, { marginPreset: "CUSTOM", marginTop: 1, marginBottom: 1, marginLeft: 0.5, marginRight: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ marginPreset: "CUSTOM", margins: { top: 1, bottom: 1, left: 0.5, right: 1 } });
    const seen = await request(app).get(url(project.id)).set("Authorization", authHeaderFor(member));
    expect(seen.body.margins).toEqual({ top: 1, bottom: 1, left: 0.5, right: 1 });
    expect((await request(app).get(`/api/groups/${project.id}/document`).set("Authorization", authHeaderFor(member))).body.pageSetup.margins).toEqual(seen.body.margins);
  });

  it("numbers without a preset mean CUSTOM and merge with the stored values", async () => {
    const { member, project } = await setup();
    await patch(project.id, member, { marginPreset: "WIDE" }).expect(200);
    const res = await patch(project.id, member, { marginLeft: 1.5 });
    expect(res.body).toMatchObject({ marginPreset: "CUSTOM", margins: { top: 1, bottom: 1, left: 1.5, right: 2 } });
  });

  it("accepts the 0 and 3 in limits", async () => {
    const { member, project } = await setup();
    await patch(project.id, member, { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 }).expect(200);
    await patch(project.id, member, { marginTop: 3, marginBottom: 3, marginLeft: 3, marginRight: 3 }).expect(200);
  });

  it("rejects out-of-range, off-step and non-numeric values with 400 and the dialog's message", async () => {
    const { member, project } = await setup();
    const cases: [object, RegExp][] = [
      [{ marginTop: 3.1 }, /Top margin must be between 0 and 3/],
      [{ marginBottom: -0.1 }, /Bottom margin must be between 0 and 3/],
      [{ marginLeft: 0.15 }, /Left margin must be a multiple of 0.1/],
      [{ marginRight: 1.05 }, /Right margin must be a multiple of 0.1/],
    ];
    for (const [body, msg] of cases) {
      const res = await patch(project.id, member, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toMatch(msg);
    }
    for (const body of [{ marginTop: "1" }, { marginTop: null }, { marginTop: Number.POSITIVE_INFINITY }]) {
      expect((await patch(project.id, member, body)).status, JSON.stringify(body)).toBe(400);
    }
    // Nothing was stored by any of the rejected requests.
    const seen = await request(app).get(url(project.id)).set("Authorization", authHeaderFor(member));
    expect(seen.body).toMatchObject({ marginPreset: "NORMAL", margins: { top: 1, bottom: 1, left: 1, right: 1 } });
  });

  it("requires 2 in of writing space in width and height, counting orientation and header/footer", async () => {
    const { member, project } = await setup();
    // Letter portrait is 8.5 in wide: 3 + 3 leaves 2.5 (ok). A4 landscape is 8.27 in high.
    await patch(project.id, member, { pageSize: "A4", orientation: "LANDSCAPE", marginTop: 3, marginBottom: 3, marginLeft: 1, marginRight: 1 }).expect(200);
    // A header takes a line of writing height: 8.27 - 6 - 0.3 = 1.97 < 2.
    const header = await patch(project.id, member, { header: { left: "Draft" } });
    expect(header.status).toBe(400);
    expect(header.body.error).toMatch(/writing height; at least 2 in is needed/);
    // Reducing the margin first makes it fine, and the stored setup was not changed by the refusal.
    await patch(project.id, member, { marginTop: 2.5, header: { left: "Draft" } }).expect(200);
  });

  it("refuses a change of orientation that no longer fits the margins", async () => {
    const { member, project } = await setup();
    // Portrait Letter: 11 in high, 3 + 3 is fine. Landscape: 8.5 in high leaves 2.5 (ok); add a footer + header and it is not.
    await patch(project.id, member, { marginTop: 3, marginBottom: 3, header: { left: "H" }, footer: { left: "F" } }).expect(200); // 11 - 6 - 0.6
    const res = await patch(project.id, member, { orientation: "LANDSCAPE" }); // 8.5 - 6 - 0.6 = 1.9
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/leave 1\.9 in/);
    expect((await request(app).get(url(project.id)).set("Authorization", authHeaderFor(member))).body.orientation).toBe("PORTRAIT");
  });

  it("the old page-size alias also refuses a paper that leaves too little room", async () => {
    const { member, project } = await setup();
    await patch(project.id, member, { orientation: "LANDSCAPE", marginTop: 3, marginBottom: 3, header: { left: "H" } }).expect(200); // Letter: 8.5 - 6 - 0.3 = 2.2
    const res = await request(app)
      .patch(`/api/groups/${project.id}/document/page-size`)
      .set("Authorization", authHeaderFor(member))
      .send({ pageSize: "A4" }); // 8.27 - 6 - 0.3 = 1.97
    expect(res.status).toBe(400);
  });

  it("margin changes create no EditEvent/EditSession/Alert and do not mark the analysis outdated", async () => {
    const { member, project, doc } = await setup();
    const before = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    await patch(project.id, member, { marginPreset: "CUSTOM", marginTop: 0.7, marginBottom: 0.7, marginLeft: 0.7, marginRight: 0.7 }).expect(200);
    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.membershipChangedAt).toEqual(before.membershipChangedAt);
    expect(after.scoringConfigChangedAt).toEqual(before.scoringConfigChangedAt);
    expect(await prisma.editEvent.count({ where: { documentId: doc.id } })).toBe(0);
    expect(await prisma.editSession.count({ where: { documentId: doc.id } })).toBe(0);
    expect(await prisma.alert.count()).toBe(0);
  });
});

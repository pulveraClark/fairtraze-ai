import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { readDocumentStructure } from "../src/collab/documentExport.js";
import { writeDocumentSnapshot } from "../src/lib/analysisRunner.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { pngDataUrl, insertImage } from "./imageFixtures.js";

const app = createApp();

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id });
  await createMembership(member.id, project.id, "LEADER");
  return { instructor, member, project };
}

const report = (projectId: number) => prisma.report.create({ data: { projectId, gini: 0, teamHealth: "Healthy", content: "{}" } });

describe("writeDocumentSnapshot — dedupe and best effort", () => {
  it("writes no new snapshot when the bytes equal the group's latest one, and writes one when they change", async () => {
    const { project } = await setup();
    const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from([1, 2, 3]) } });
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id);
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id); // unchanged
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(1);

    await prisma.document.update({ where: { id: doc.id }, data: { yjsState: Buffer.from([1, 2, 3, 4]) } });
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id);
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(2);

    // Going back to older bytes is a change from the latest, so it is kept.
    await prisma.document.update({ where: { id: doc.id }, data: { yjsState: Buffer.from([1, 2, 3]) } });
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id);
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(3);
  }, 60000);

  it("never throws: a failing write is logged without document data", async () => {
    const { project } = await setup();
    const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from([9, 9, 9]) } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // A report id that does not exist breaks the foreign key on create.
    await expect(writeDocumentSnapshot(doc.id, 2_000_000_000)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/9, 9, 9|<Buffer/);
    spy.mockRestore();
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(0);
  }, 30000);
});

describe("history versions show images as a placeholder", () => {
  function stateWithImages(): Uint8Array {
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const para = new Y.XmlElement("paragraph");
    const t1 = new Y.XmlText(); t1.insert(0, "Before");
    para.insert(0, [t1]);
    fragment.insert(0, [para]);
    insertImage(fragment, 1, pngDataUrl(800, 600, 30_000, 5)); // block-level image
    const inline = new Y.XmlElement("paragraph");
    const t2 = new Y.XmlText(); t2.insert(0, "Inline ");
    inline.insert(0, [t2]);
    const img = new Y.XmlElement("image");
    img.setAttribute("src", pngDataUrl(800, 600, 30_000, 6));
    inline.insert(1, [img]);
    fragment.insert(2, [inline]);
    const s = Y.encodeStateAsUpdate(ydoc);
    ydoc.destroy();
    return s;
  }

  it("the version route returns '[image]' lines and none of the image data", async () => {
    const { member, project } = await setup();
    const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from([1]) } });
    const snap = await prisma.documentSnapshot.create({ data: { documentId: doc.id, yjsState: Buffer.from(stateWithImages()) } });
    const res = await request(app).get(`/api/groups/${project.id}/document/snapshots/${snap.id}`).set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect((text.match(/\[image\]/g) ?? []).length).toBe(2);
    expect(text).not.toMatch(/data:image|base64/);
    expect(res.text.length).toBeLessThan(2000);
  }, 30000);

  it("the export and the headings keep their old output (no placeholder unless asked)", () => {
    const blocks = readDocumentStructure({ content: "", yjsState: stateWithImages() });
    expect(JSON.stringify(blocks)).not.toMatch(/\[image\]/);
    const withPh = readDocumentStructure({ content: "", yjsState: stateWithImages() }, { imagePlaceholders: true });
    expect(JSON.stringify(withPh)).toMatch(/\[image\]/);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { readDocumentStructure } from "../src/collab/documentExport.js";
import { writeDocumentSnapshot } from "../src/lib/analysisRunner.js";
import { blankImageData } from "../src/lib/snapshotImages.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { pngDataUrl, insertImage } from "./imageFixtures.js";

const app = createApp();
const BIG = (seed: number) => pngDataUrl(800, 600, 1_000_000, seed); // about 1.3 MB of base64 each

function liveState(imageSeeds: number[]): Uint8Array {
  const ydoc = new Y.Doc();
  ydoc.clientID = 424242; // the real document is written by other clients
  const fragment = ydoc.getXmlFragment("default");
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText(); p.insert(0, [t]); t.insert(0, "Some text before the images.");
  fragment.insert(0, [p]);
  imageSeeds.forEach((s, i) => insertImage(fragment, 1 + i, BIG(s)));
  const inline = new Y.XmlElement("paragraph");
  const it = new Y.XmlText(); inline.insert(0, [it]); it.insert(0, "Inline ");
  const img = new Y.XmlElement("image"); img.setAttribute("src", BIG(99));
  inline.insert(1, [img]);
  fragment.insert(fragment.length, [inline]);
  const s = Y.encodeStateAsUpdate(ydoc); ydoc.destroy(); return s;
}

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id });
  await createMembership(member.id, project.id, "LEADER");
  return { member, project };
}
const report = (projectId: number) => prisma.report.create({ data: { projectId, gini: 0, teamHealth: "Healthy", content: "{}" } });

describe("blankImageData", () => {
  it("keeps every image node, drops the data, and gives the same bytes for the same document", () => {
    const live = liveState([1, 2, 3]);
    const a = blankImageData(live), b = blankImageData(live);
    expect(live.length).toBeGreaterThan(4_000_000);
    expect(a.length).toBeLessThan(10_000);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const doc = new Y.Doc(); Y.applyUpdate(doc, a);
    const imgs: any[] = [];
    const walk = (n: any) => { for (const c of n.toArray()) { if (c instanceof Y.XmlElement) { if (c.nodeName === "image") imgs.push(c); walk(c); } } };
    walk(doc.getXmlFragment("default"));
    expect(imgs).toHaveLength(4);
    for (const i of imgs) expect(i.getAttribute("src")).toBe("");
  });
  it("returns a state without images, or an unreadable one, unchanged", () => {
    const plain = liveState([]); // still has the one inline image
    const noImg = new Y.Doc(); noImg.getXmlFragment("default").insert(0, [new Y.XmlElement("paragraph")]);
    const s = Y.encodeStateAsUpdate(noImg);
    expect(blankImageData(s)).toBe(s);
    const junk = new Uint8Array([1]);
    expect(blankImageData(junk)).toBe(junk);
    expect(plain.length).toBeGreaterThan(1000);
  });
});

describe("writeDocumentSnapshot with images", () => {
  it("stores a small blanked copy, leaves Document.yjsState alone, and the version still shows [image]", async () => {
    const { member, project } = await setup();
    const live = liveState([1, 2]);
    const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(live) } });
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id);

    const snaps = await prisma.documentSnapshot.findMany({ where: { documentId: doc.id } });
    expect(snaps).toHaveLength(1);
    expect(snaps[0].yjsState.length).toBeLessThan(10_000);
    const after = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(Buffer.from(after.yjsState!).equals(Buffer.from(live))).toBe(true); // never changed

    const res = await request(app).get(`/api/groups/${project.id}/document/snapshots/${snaps[0].id}`).set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(200);
    expect((JSON.stringify(res.body).match(/\[image\]/g) ?? []).length).toBe(3);
    expect(res.text).not.toMatch(/data:image|base64/);
  }, 60000);

  it("re-saving an unchanged document writes no new row; adding an image does", async () => {
    const { project } = await setup();
    const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(liveState([1])) } });
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id);
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id); // same document
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(1);

    // The document gains an image: a different structure, so a new row.
    await prisma.document.update({ where: { id: doc.id }, data: { yjsState: Buffer.from(liveState([1, 2])) } });
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id);
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(2);
    await writeDocumentSnapshot(doc.id, (await report(project.id)).id); // unchanged again
    expect(await prisma.documentSnapshot.count({ where: { documentId: doc.id } })).toBe(2);
  }, 60000);

  it("the history, export and headings readers never need image data", () => {
    const blanked = blankImageData(liveState([1]));
    const withPh = readDocumentStructure({ content: "", yjsState: blanked }, { imagePlaceholders: true });
    expect(JSON.stringify(withPh)).toMatch(/\[image\]/);
    expect(() => readDocumentStructure({ content: "", yjsState: blanked })).not.toThrow();
  });
});

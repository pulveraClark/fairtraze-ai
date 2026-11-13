import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { createProject, createUser } from "./factories.js";
import { pngDataUrl, insertImage } from "./imageFixtures.js";
import { decodeImageSrc } from "../src/collab/imageRegistry.js";

// Builds a document whose saved Yjs state holds `srcs`, plus registry rows for the given owners.
async function setupDoc(rows: { src: string; owner: number; inDoc?: boolean }[]) {
  const project = await createProject();
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  let i = 0;
  for (const r of rows) if (r.inDoc !== false) insertImage(fragment, i++, r.src);
  const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(Y.encodeStateAsUpdate(ydoc)) } });
  for (const r of rows) {
    const d = decodeImageSrc(r.src)!;
    await prisma.documentImage.create({
      data: { documentId: doc.id, contentHash: d.contentHash, ownerUserId: r.owner, byteSize: d.byteSize, width: d.width, height: d.height },
    });
  }
  return doc;
}

const rosterOf = (...users: { id: number; name: string }[]) =>
  users.map((u) => ({ userId: u.id, studentName: u.name, githubUsername: "" }));

describe("computeDocumentRawStats — image credit", () => {
  it("counts images still in the document per owner; tiny, deleted and unregistered images do not count", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const { user: b } = await createUser({ systemRole: "STUDENT" });
    const doc = await setupDoc([
      { src: pngDataUrl(800, 600, 30_000, 1), owner: a.id },
      { src: pngDataUrl(800, 600, 30_000, 2), owner: a.id },
      { src: pngDataUrl(800, 600, 30_000, 3), owner: b.id },
      { src: pngDataUrl(50, 50, 30_000, 4), owner: b.id },             // too few pixels
      { src: pngDataUrl(800, 600, 2_000, 5), owner: b.id },            // too few bytes
      { src: pngDataUrl(800, 600, 30_000, 6), owner: a.id, inDoc: false }, // deleted from the document
    ]);
    // An old image with no registry row: present in the document, never registered.
    const saved = new Y.Doc();
    Y.applyUpdate(saved, new Uint8Array((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).yjsState!));
    const savedFragment = saved.getXmlFragment("default");
    insertImage(savedFragment, savedFragment.length, pngDataUrl(800, 600, 30_000, 7));
    await prisma.document.update({ where: { id: doc.id }, data: { yjsState: Buffer.from(Y.encodeStateAsUpdate(saved)) } });

    const stats = await computeDocumentRawStats(doc.id, rosterOf(a, b));
    expect(stats.find((s) => s.userId === a.id)!.countedImageCount).toBe(2);
    expect(stats.find((s) => s.userId === b.id)!.countedImageCount).toBe(1);
  }, 30000);

  it("the same content counts once even if two registry-style copies appear in the document", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const same = pngDataUrl(800, 600, 30_000, 11);
    const project = await createProject();
    const ydoc = new Y.Doc();
    insertImage(ydoc.getXmlFragment("default"), 0, same);
    insertImage(ydoc.getXmlFragment("default"), 1, same);
    const doc = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(Y.encodeStateAsUpdate(ydoc)) } });
    const d = decodeImageSrc(same)!;
    await prisma.documentImage.create({ data: { documentId: doc.id, contentHash: d.contentHash, ownerUserId: a.id, byteSize: d.byteSize, width: d.width, height: d.height } });

    const stats = await computeDocumentRawStats(doc.id, rosterOf(a));
    expect(stats[0].countedImageCount).toBe(1);
  }, 30000);

  it("the same image in two groups counts in each group", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const { user: b } = await createUser({ systemRole: "STUDENT" });
    const src = pngDataUrl(800, 600, 30_000, 12);
    const docA = await setupDoc([{ src, owner: a.id }]);
    const docB = await setupDoc([{ src, owner: b.id }]);
    expect((await computeDocumentRawStats(docA.id, rosterOf(a)))[0].countedImageCount).toBe(1);
    expect((await computeDocumentRawStats(docB.id, rosterOf(b)))[0].countedImageCount).toBe(1);
  }, 30000);

  it("an image-only session adds no session and no session date; gross inserted images still show", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const doc = await setupDoc([{ src: pngDataUrl(800, 600, 30_000, 21), owner: a.id }]);
    await prisma.editSession.create({ data: { documentId: doc.id, userId: a.id, characterCount: 0, imageInsertCount: 1 } });
    await prisma.editSession.create({ data: { documentId: doc.id, userId: a.id, characterCount: 120, imageInsertCount: 0 } });

    const s = (await computeDocumentRawStats(doc.id, rosterOf(a)))[0];
    expect(s.sessionCount).toBe(1);
    expect(s.sessionDates).toHaveLength(1);
    expect(s.insertedImageCount).toBe(1);
    expect(s.countedImageCount).toBe(1);
  }, 30000);

  it("a member with only images has no sessions and no active days, and the limit applies end to end", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const { user: b } = await createUser({ systemRole: "STUDENT" });
    const doc = await setupDoc(Array.from({ length: 8 }, (_, i) => ({ src: pngDataUrl(800, 600, 30_000, 30 + i), owner: a.id })));
    await prisma.editSession.create({ data: { documentId: doc.id, userId: a.id, characterCount: 0, imageInsertCount: 8 } });

    const raw = await computeDocumentRawStats(doc.id, rosterOf(a, b));
    const at = (limit: number | null) => computeDocumentTeamReport(raw, undefined, undefined, null, undefined, limit).members.find((m) => m.userId === a.id)!;
    expect(at(3).countedImageCount).toBe(3);
    expect(at(5).countedImageCount).toBe(5);
    expect(at(10).countedImageCount).toBe(8);
    expect(at(null).countedImageCount).toBe(8);
    expect(at(5).effectiveRetainedChars).toBe(500);
    expect(at(5).activeDays).toBe(0);
    expect(at(5).sessionCount).toBe(0);
    expect(at(5).flags).toContain("inactive");
  }, 30000);

  it("a document with no row yet gives zero counted images", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const stats = await computeDocumentRawStats(null, rosterOf(a));
    expect(stats[0].countedImageCount).toBe(0);
  });
});

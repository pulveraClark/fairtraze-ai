import { describe, it, expect, vi, afterEach } from "vitest";
import WebSocket from "ws";
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import { decodeImageSrc, imageDimensions, MAX_IMAGE_SRC_CHARS } from "../src/collab/imageRegistry.js";
import { createProject, createUser } from "./factories.js";
import { pngDataUrl, insertImage } from "./imageFixtures.js";

function fakeConnFor(userId: number): WebSocket {
  const conn = Object.create(WebSocket.prototype) as WebSocket;
  wsUserId.set(conn, userId);
  return conn;
}

const settle = () => new Promise((r) => setTimeout(r, 2000)); // FLUSH_DEBOUNCE_MS + margin
const hashOf = (src: string) => createHash("sha256").update(Buffer.from(src.split(",")[1], "base64")).digest("hex");

afterEach(() => vi.restoreAllMocks());

describe("image decoding (no database)", () => {
  it("reads PNG size and hash from a data URL", () => {
    const src = pngDataUrl(640, 480, 12_000, 7);
    const d = decodeImageSrc(src)!;
    expect(d.width).toBe(640);
    expect(d.height).toBe(480);
    expect(d.byteSize).toBe(12_000);
    expect(d.contentHash).toBe(hashOf(src));
  });
  it("different content gets a different hash, same content the same hash", () => {
    expect(decodeImageSrc(pngDataUrl(10, 10, 6000, 1))!.contentHash).not.toBe(decodeImageSrc(pngDataUrl(10, 10, 6000, 2))!.contentHash);
    expect(decodeImageSrc(pngDataUrl(10, 10, 6000, 1))!.contentHash).toBe(decodeImageSrc(pngDataUrl(10, 10, 6000, 1))!.contentHash);
  });
  it("returns null for anything that is not a supported data URL, an empty body or too large", () => {
    expect(decodeImageSrc("https://example.com/a.png")).toBeNull();
    expect(decodeImageSrc("data:image/gif;base64,AAAA")).toBeNull();
    expect(decodeImageSrc("data:image/png;base64,")).toBeNull();
    expect(decodeImageSrc("data:image/png;base64," + "A".repeat(MAX_IMAGE_SRC_CHARS))).toBeNull();
  });
  it("reads JPEG and WebP headers, and gives up on junk", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageDimensions(jpeg)).toEqual({ width: 640, height: 480 });
    const webp = Buffer.alloc(40);
    webp.write("RIFF", 0, "ascii"); webp.write("WEBP", 8, "ascii"); webp.write("VP8X", 12, "ascii");
    webp[24] = 0x7f; webp[25] = 0x02; webp[27] = 0xdf; webp[28] = 0x01; // 639 -> 640, 479 -> 480
    expect(imageDimensions(webp)).toEqual({ width: 640, height: 480 });
    expect(imageDimensions(Buffer.from("not an image at all, just text"))).toBeNull();
  });
});

describe("image registry in the collab listener", () => {
  it("registers a new image to the member who inserted it, with hash and size, and no image bytes", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const src = pngDataUrl(800, 600, 30_000, 3);

    await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
    ydoc.transact(() => insertImage(fragment, 0, src), fakeConnFor(user.id));
    await settle();

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    const rows = await prisma.documentImage.findMany({ where: { documentId: doc.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerUserId: user.id, contentHash: hashOf(src), byteSize: 30_000, width: 800, height: 600 });
  }, 30000);

  it("the same image inserted again by another member keeps the first inserter (insert-if-missing)", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const { user: b } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const src = pngDataUrl(800, 600, 30_000, 4);

    await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
    ydoc.transact(() => insertImage(fragment, 0, src), fakeConnFor(a.id));
    await settle();
    // B copies it while it is still there, then A deletes the original and B's copy stays.
    ydoc.transact(() => insertImage(fragment, 1, src), fakeConnFor(b.id));
    ydoc.transact(() => fragment.delete(1, 1), fakeConnFor(b.id));
    ydoc.transact(() => fragment.delete(0, 1), fakeConnFor(a.id));
    ydoc.transact(() => insertImage(fragment, 0, src), fakeConnFor(b.id)); // re-added by B after it was fully gone
    await settle();

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    const rows = await prisma.documentImage.findMany({ where: { documentId: doc.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerUserId).toBe(a.id);
  }, 30000);

  it("reloading a room that already has images registers nothing new and credits nobody", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    // The saved document already holds two images.
    const saved = new Y.Doc();
    const savedFragment = saved.getXmlFragment("default");
    insertImage(savedFragment, 0, pngDataUrl(800, 600, 30_000, 5));
    insertImage(savedFragment, 1, pngDataUrl(800, 600, 30_000, 6));
    const state = Y.encodeStateAsUpdate(saved);

    // A fresh room: attach, then the persisted state is restored with no user origin (what bindState does).
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
    Y.applyUpdate(ydoc, state);

    // A member then types text: the images must still not be registered as new.
    const para = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    para.insert(0, [text]);
    ydoc.transact(() => { fragment.insert(0, [para]); text.insert(0, "Some typed text"); }, fakeConnFor(user.id));
    await settle();

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    expect(await prisma.documentImage.count({ where: { documentId: doc.id } })).toBe(0);
    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    expect(events.length).toBeGreaterThan(0); // typing still recorded
    const sessions = await prisma.editSession.findMany({ where: { documentId: doc.id } });
    expect(sessions.reduce((n, s) => n + s.imageInsertCount, 0)).toBe(0);
  }, 30000);

  it("a read-only connection never registers an image", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR" });
    const project = await createProject();
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(user.id);
    const { readOnlyWs } = await import("../src/collab/connectionRegistry.js");
    readOnlyWs.add(conn);

    await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
    ydoc.transact(() => insertImage(fragment, 0, pngDataUrl(800, 600, 30_000, 8)), conn);
    await settle();

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    expect(await prisma.documentImage.count({ where: { documentId: doc.id } })).toBe(0);
  }, 30000);

  it("an unreadable or oversized image earns no registry row and never breaks editing", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(user.id);

    await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
    expect(() => {
      ydoc.transact(() => insertImage(fragment, 0, "data:image/png;base64,fakeDataForTest"), conn);
      ydoc.transact(() => insertImage(fragment, 1, "data:image/png;base64," + "A".repeat(MAX_IMAGE_SRC_CHARS)), conn);
      ydoc.transact(() => insertImage(fragment, 2, "https://example.com/x.png"), conn);
    }).not.toThrow();

    const para = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    para.insert(0, [text]);
    ydoc.transact(() => { fragment.insert(0, [para]); text.insert(0, "Still typing"); }, conn);
    await settle();

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    expect(await prisma.documentImage.count({ where: { documentId: doc.id } })).toBe(0);
    expect((await prisma.editEvent.findMany({ where: { documentId: doc.id } })).length).toBeGreaterThan(0);
  }, 30000);

  it("a failing registry write is logged without image data and does not stop the event flush", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(user.id);
    const src = pngDataUrl(800, 600, 30_000, 9);
    const secret = src.split(",")[1].slice(0, 200);

    const boom = Object.assign(new Error("boom " + secret), { code: "P2002" });
    vi.spyOn(prisma.documentImage, "createMany").mockRejectedValue(boom as never);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);
    const para = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    para.insert(0, [text]);
    ydoc.transact(() => { fragment.insert(0, [para]); text.insert(0, "Text next to an image"); insertImage(fragment, 1, src); }, conn);
    await settle();

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    expect((await prisma.editEvent.findMany({ where: { documentId: doc.id } })).length).toBeGreaterThan(0);
    expect(await prisma.documentImage.count({ where: { documentId: doc.id } })).toBe(0);
    const lines = logged.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(lines).toContain("image registry write failed");
    expect(lines).not.toContain(secret);
  }, 30000);
});

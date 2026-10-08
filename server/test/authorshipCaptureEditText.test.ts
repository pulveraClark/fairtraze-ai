import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import { createProject, createUser } from "./factories.js";

// Same fake-origin technique as authorshipCapture.test.ts / authorshipCaptureImage.test.ts.
function fakeConnFor(userId: number): WebSocket {
  const conn = Object.create(WebSocket.prototype) as WebSocket;
  wsUserId.set(conn, userId);
  return conn;
}

// Regression coverage for the additive literal-text capture on EditEvent (insertedText/
// deletedText) — confirms the new columns populate correctly, and that existing
// position/length/eventType/editType shape used by scoring/diffing is completely unchanged.
describe("attachAuthorshipTracking — literal text capture", () => {
  it("captures insertedText on an INSERT event without changing position/length", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(user.id);

    const room = `group-doc-${project.id}`;
    const attachPromise = attachAuthorshipTracking(room, project.id, ydoc);
    await attachPromise;

    ydoc.transact(() => {
      const para = new Y.XmlElement("paragraph");
      const text = new Y.XmlText();
      text.insert(0, "hello world");
      para.insert(0, [text]);
      fragment.insert(0, [para]);
    }, conn);

    await new Promise((resolve) => setTimeout(resolve, 2000)); // FLUSH_DEBOUNCE_MS + margin

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(doc).not.toBeNull();

    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id, eventType: "INSERT" } });
    expect(events.length).toBe(1);
    expect(events[0].position).toBe(0);
    expect(events[0].length).toBe("hello world".length);
    expect(events[0].insertedText).toBe("hello world");
    expect(events[0].deletedText).toBeNull();
  }, 30000);

  it("captures deletedText on a DELETE event without changing position/length", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(user.id);

    const room = `group-doc-${project.id}`;
    const attachPromise = attachAuthorshipTracking(room, project.id, ydoc);
    await attachPromise;

    let text!: InstanceType<typeof Y.XmlText>;
    ydoc.transact(() => {
      const para = new Y.XmlElement("paragraph");
      text = new Y.XmlText();
      text.insert(0, "hello world");
      para.insert(0, [text]);
      fragment.insert(0, [para]);
    }, conn);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    ydoc.transact(() => {
      text.delete(0, "hello ".length);
    }, conn);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    const deleteEvents = await prisma.editEvent.findMany({ where: { documentId: doc!.id, eventType: "DELETE" } });
    expect(deleteEvents.length).toBe(1);
    expect(deleteEvents[0].position).toBe(0);
    expect(deleteEvents[0].length).toBe("hello ".length);
    expect(deleteEvents[0].deletedText).toBe("hello ");
    expect(deleteEvents[0].insertedText).toBeNull();
  }, 30000);
});

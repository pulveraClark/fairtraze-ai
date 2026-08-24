import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import { createProject, createUser } from "./factories.js";

// A fake origin that passes `instanceof WebSocket` without opening a real connection — same
// technique authorshipCapture.test.ts / authorshipCaptureTable.test.ts already use. Two distinct
// fake connections (one per userId) is how this stands in for "two different logged-in browser
// sessions editing the same document live" — the update listener's origin-dispatch logic (which
// resolves userId via wsUserId.get(origin)) cannot tell this apart from two real WebSockets.
function fakeConnFor(userId: number): WebSocket {
  const conn = Object.create(WebSocket.prototype) as WebSocket;
  wsUserId.set(conn, userId);
  return conn;
}

function insertImageNode(fragment: InstanceType<typeof Y.XmlFragment>, index: number) {
  const image = new Y.XmlElement("image");
  image.setAttribute("src", "data:image/png;base64,fakeDataForTest");
  fragment.insert(index, [image]);
}

describe("attachAuthorshipTracking — image insertion", () => {
  it("produces zero EditEvent rows for an image-only insert, but attributes an EditSession.imageInsertCount", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(user.id);

    const room = `group-doc-${project.id}`;
    const attachPromise = attachAuthorshipTracking(room, project.id, ydoc);

    ydoc.transact(() => {
      insertImageNode(fragment, 0);
    }, conn);

    await attachPromise;
    await new Promise((resolve) => setTimeout(resolve, 2000)); // FLUSH_DEBOUNCE_MS + margin

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(doc).not.toBeNull();

    // Confirms the documented behavior: TipTap image nodes are attribute-only Y.XmlElements with
    // no Y.XmlText child, so they produce zero text delta — no EditEvent at all, not even an
    // unclassified one.
    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
    expect(events.length).toBe(0);

    const sessions = await prisma.editSession.findMany({ where: { documentId: doc!.id, userId: user.id } });
    expect(sessions.length).toBe(1);
    expect(sessions[0].imageInsertCount).toBe(1);
    expect(sessions[0].characterCount).toBe(0);
  }, 30000);

  it("attributes concurrent image inserts from two different users to their own sessions independently", async () => {
    const { user: userA } = await createUser({ systemRole: "STUDENT" });
    const { user: userB } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const connA = fakeConnFor(userA.id);
    const connB = fakeConnFor(userB.id);

    const room = `group-doc-${project.id}`;
    const attachPromise = attachAuthorshipTracking(room, project.id, ydoc);
    await attachPromise;

    // User A inserts two images; User B inserts one — mirrors two independent live sessions
    // editing concurrently, each via its own WebSocket-origin transaction.
    ydoc.transact(() => insertImageNode(fragment, 0), connA);
    ydoc.transact(() => insertImageNode(fragment, 1), connA);
    ydoc.transact(() => insertImageNode(fragment, 2), connB);

    await new Promise((resolve) => setTimeout(resolve, 2000)); // FLUSH_DEBOUNCE_MS + margin

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(doc).not.toBeNull();

    const sessionsA = await prisma.editSession.findMany({ where: { documentId: doc!.id, userId: userA.id } });
    const sessionsB = await prisma.editSession.findMany({ where: { documentId: doc!.id, userId: userB.id } });

    expect(sessionsA.length).toBe(1);
    expect(sessionsA[0].imageInsertCount).toBe(2);
    expect(sessionsB.length).toBe(1);
    expect(sessionsB[0].imageInsertCount).toBe(1);
  }, 30000);

  it("does not decrement imageInsertCount when an inserted image is later deleted (gross, not net)", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(user.id);

    const room = `group-doc-${project.id}`;
    const attachPromise = attachAuthorshipTracking(room, project.id, ydoc);
    await attachPromise;

    ydoc.transact(() => insertImageNode(fragment, 0), conn);
    ydoc.transact(() => {
      fragment.delete(0, 1);
    }, conn);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    const sessions = await prisma.editSession.findMany({ where: { documentId: doc!.id, userId: user.id } });
    expect(sessions.length).toBe(1);
    expect(sessions[0].imageInsertCount).toBe(1);
  }, 30000);
});

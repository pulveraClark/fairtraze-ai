import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import {
  createProject,
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createMembership,
} from "./factories.js";

const app = createApp();

// Page layout (page view, page size switches, PDF export) must add 0 characters to anyone's
// authorship count. Layout lives only in client-side ProseMirror widgets and one Document column
// (pageSize); neither reaches authorshipCapture.ts. This runs the REAL capture pipeline over typing
// with the page size changed repeatedly in between (as collaborators switching Short/Long/A4
// would) and asserts the recorded character count equals exactly the typed text. (The client-side
// half — a TipTap editor with the pagination extension emits identical Yjs content and zero extra
// updates — is client/src/lib/pageLayout.test.ts.)
describe("authorship capture is unaffected by page size changes", () => {
  it("records exactly the typed characters even when page size is switched between edits", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(user.id, project.id, "LEADER");

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const fakeConn = Object.create(WebSocket.prototype) as WebSocket;
    wsUserId.set(fakeConn, user.id);

    const attachPromise = attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);

    const typeParagraph = (text: string) =>
      ydoc.transact(() => {
        const t = new Y.XmlText();
        t.insert(0, text);
        const p = new Y.XmlElement("paragraph");
        p.insert(0, [t]);
        fragment.insert(fragment.length, [p]);
      }, fakeConn);

    const first = "First paragraph typed before any page size change.";
    const second = "Second paragraph typed after switching to A4 and Long.";
    const third = "Third paragraph typed after switching back to Short.";

    typeParagraph(first);
    await attachPromise;
    await new Promise((r) => setTimeout(r, 2000)); // flush debounce
    // The Document row exists now; switch page size through the real route, several times.
    for (const size of ["A4", "LEGAL", "LETTER"]) {
      await request(app)
        .patch(`/api/groups/${project.id}/document/page-size`)
        .set("Authorization", authHeaderFor(user))
        .send({ pageSize: size })
        .expect(200);
      if (size === "A4") typeParagraph(second);
    }
    typeParagraph(third);
    await new Promise((r) => setTimeout(r, 2000));

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    expect(doc.pageSize).toBe("LETTER");
    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    expect(events.every((e) => e.userId === user.id && e.eventType === "INSERT")).toBe(true);
    const inserted = events.reduce((sum, e) => sum + e.length, 0);
    expect(inserted).toBe(first.length + second.length + third.length);
  }, 40000);
});

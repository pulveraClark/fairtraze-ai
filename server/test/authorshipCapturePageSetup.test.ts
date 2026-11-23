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

// Page setup (paper, orientation, margins) and header/footer text live in Document columns and in
// client-side layout widgets; none of it reaches authorshipCapture.ts. This runs the REAL capture
// pipeline over typing with the page setup and header/footer text changed repeatedly in between
// (as collaborators would) and asserts the recorded characters equal exactly the typed text - the
// header/footer text, however long, is never counted for anyone.
describe("authorship capture is unaffected by page setup and header/footer changes", () => {
  it("records exactly the typed characters", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: alice } = await createUser({ systemRole: "STUDENT" });
    const { user: bob } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(alice.id, project.id, "LEADER");
    await createMembership(bob.id, project.id, "MEMBER");

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const connFor = (id: number) => {
      const c = Object.create(WebSocket.prototype) as WebSocket;
      wsUserId.set(c, id);
      return c;
    };
    const aliceConn = connFor(alice.id);
    const bobConn = connFor(bob.id);
    const attachPromise = attachAuthorshipTracking(`group-doc-${project.id}`, project.id, ydoc);

    const typeParagraph = (conn: WebSocket, text: string) =>
      ydoc.transact(() => {
        const t = new Y.XmlText();
        t.insert(0, text);
        const p = new Y.XmlElement("paragraph");
        p.insert(0, [t]);
        fragment.insert(fragment.length, [p]);
      }, conn);
    // A page break is a leaf block with no text.
    const insertPageBreak = (conn: WebSocket) =>
      ydoc.transact(() => fragment.insert(fragment.length, [new Y.XmlElement("pageBreak")]), conn);

    const one = "Alice writes the first paragraph before any page setup change.";
    const two = "Bob writes the second after switching to landscape and narrow margins.";
    const three = "Alice writes the third after adding a long header and footer.";

    typeParagraph(aliceConn, one);
    await attachPromise;
    await new Promise((r) => setTimeout(r, 2000)); // flush debounce; the Document row exists now

    const patch = (who: typeof alice, body: object) =>
      request(app).patch(`/api/groups/${project.id}/document/page-setup`).set("Authorization", authHeaderFor(who)).send(body).expect(200);

    await patch(bob, { orientation: "LANDSCAPE", marginPreset: "NARROW" });
    insertPageBreak(bobConn);
    typeParagraph(bobConn, two);
    await patch(alice, { pageSize: "A4", header: { left: "Group 4 - capstone", center: "x".repeat(120), right: "Page {page}" } });
    await patch(bob, { footer: { left: "y".repeat(120), center: "{page}", right: "z".repeat(120) } });
    typeParagraph(aliceConn, three);
    await patch(alice, { header: { left: "", center: "", right: "" }, orientation: "PORTRAIT", marginPreset: "WIDE" });
    await new Promise((r) => setTimeout(r, 2000));

    const doc = await prisma.document.findUniqueOrThrow({ where: { groupId: project.id } });
    expect(doc.footerLeft).toHaveLength(120); // the setup really was written
    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    expect(events.every((e) => e.eventType === "INSERT")).toBe(true);
    const insertedBy = (id: number) => events.filter((e) => e.userId === id).reduce((n, e) => n + e.length, 0);
    expect(insertedBy(alice.id)).toBe(one.length + three.length);
    expect(insertedBy(bob.id)).toBe(two.length); // the page break and all header/footer text add nothing
  }, 60000);
});

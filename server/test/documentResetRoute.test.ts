import { describe, it, expect } from "vitest";
import request from "supertest";
import WebSocket from "ws";
import { setPersistence, getYDoc, docs } from "y-websocket/bin/utils";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { yjsPersistence } from "../src/collab/persistence.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const app = createApp();

// Same startup wiring documentImportRoute.test.ts replicates — createApp() excludes the WebSocket
// server, and POST /document/reset reaches the live room via getYDoc(), which only calls
// persistence.bindState() for a newly-created room once something has called setPersistence().
setPersistence(yjsPersistence);

function fakeConnFor(userId: number): WebSocket {
  const conn = Object.create(WebSocket.prototype) as WebSocket;
  wsUserId.set(conn, userId);
  return conn;
}

async function setupEditorGroup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(leader.id, project.id, "LEADER");
  return { instructor, leader, project };
}

async function initBlankDocument(leader: { id: number; email: string; name: string; systemRole: "STUDENT" }, projectId: number) {
  const res = await request(app)
    .post(`/api/groups/${projectId}/document/init`)
    .set("Authorization", authHeaderFor(leader))
    .send({});
  expect(res.status).toBe(200);
  return (await prisma.document.findUnique({ where: { groupId: projectId } }))!;
}

// Cleans up a room this test created directly via attachAuthorshipTracking/getYDoc so its
// in-memory state and pending debounce timers can't leak into the next test — same technique
// documentImportRoute.test.ts already uses for the same reason (no WebSocket ever attached, so
// y-websocket's own eviction never runs).
async function cleanupRoom(projectId: number) {
  const room = `group-doc-${projectId}`;
  const liveYdoc = docs.get(room);
  if (liveYdoc) {
    await yjsPersistence.writeState(room, liveYdoc);
    liveYdoc.destroy();
    docs.delete(room);
  }
}

describe("Document resettability (GET /document/status resettable + POST /document/reset)", () => {
  it("is resettable for a freshly-templated document with no real activity, and reset succeeds", async () => {
    const { leader, project } = await setupEditorGroup();
    await initBlankDocument(leader, project.id);

    const statusRes = await request(app)
      .get(`/api/groups/${project.id}/document/status`)
      .set("Authorization", authHeaderFor(leader));
    expect(statusRes.body).toEqual({ exists: true, resettable: true });

    const resetRes = await request(app)
      .post(`/api/groups/${project.id}/document/reset`)
      .set("Authorization", authHeaderFor(leader));
    expect(resetRes.status).toBe(200);
    expect(resetRes.body).toEqual({ reset: true });

    const afterRes = await request(app)
      .get(`/api/groups/${project.id}/document/status`)
      .set("Authorization", authHeaderFor(leader));
    expect(afterRes.body).toEqual({ exists: false, resettable: false });

    const row = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(row).toBeNull();
  }, 30000);

  it("is NOT resettable once real text has been typed (EditEvent/EditSession exist), and reset 409s", async () => {
    const { leader, project } = await setupEditorGroup();
    const doc = await initBlankDocument(leader, project.id);

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(leader.id);
    const room = `group-doc-${project.id}`;
    await attachAuthorshipTracking(room, project.id, ydoc);
    ydoc.transact(() => {
      const text = new Y.XmlText();
      text.insert(0, "Real typed content");
      const para = new Y.XmlElement("paragraph");
      para.insert(0, [text]);
      fragment.insert(0, [para]);
    }, conn);
    await new Promise((resolve) => setTimeout(resolve, 2000)); // authorshipCapture flush debounce + margin

    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    expect(events.length).toBeGreaterThan(0);

    const statusRes = await request(app)
      .get(`/api/groups/${project.id}/document/status`)
      .set("Authorization", authHeaderFor(leader));
    expect(statusRes.body.resettable).toBe(false);

    const resetRes = await request(app)
      .post(`/api/groups/${project.id}/document/reset`)
      .set("Authorization", authHeaderFor(leader));
    expect(resetRes.status).toBe(409);

    const row = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(row).not.toBeNull(); // never deleted

    await cleanupRoom(project.id);
  }, 30000);

  it("is NOT resettable once an image has been inserted (EditSession exists, zero EditEvent), and reset 409s", async () => {
    const { leader, project } = await setupEditorGroup();
    const doc = await initBlankDocument(leader, project.id);

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    const conn = fakeConnFor(leader.id);
    const room = `group-doc-${project.id}`;
    await attachAuthorshipTracking(room, project.id, ydoc);
    ydoc.transact(() => {
      const image = new Y.XmlElement("image");
      image.setAttribute("src", "data:image/png;base64,fakeDataForTest");
      fragment.insert(0, [image]);
    }, conn);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    const sessions = await prisma.editSession.findMany({ where: { documentId: doc.id } });
    expect(events.length).toBe(0); // confirms this is genuinely the "image-only, no text delta" case
    expect(sessions.length).toBeGreaterThan(0);

    const statusRes = await request(app)
      .get(`/api/groups/${project.id}/document/status`)
      .set("Authorization", authHeaderFor(leader));
    expect(statusRes.body.resettable).toBe(false);

    const resetRes = await request(app)
      .post(`/api/groups/${project.id}/document/reset`)
      .set("Authorization", authHeaderFor(leader));
    expect(resetRes.status).toBe(409);

    await cleanupRoom(project.id);
  }, 30000);

  it("is NOT resettable once a comment exists on template-only content (zero EditEvent/EditSession), and reset 409s", async () => {
    const { leader, project } = await setupEditorGroup();
    const doc = await initBlankDocument(leader, project.id);

    // A comment can be added by selecting existing (e.g. template) text with zero typing — the
    // real edge case this endpoint must guard against. Created directly via Prisma here since the
    // anchor is opaque, arbitrary bytes to the server (see comments.ts) — no real TipTap editor
    // state is needed to exercise the resettable-check logic itself.
    await prisma.comment.create({
      data: {
        documentId: doc.id,
        authorId: leader.id,
        text: "Selected the template heading without typing anything.",
        anchor: Buffer.from("fake-anchor-bytes"),
      },
    });

    const events = await prisma.editEvent.count({ where: { documentId: doc.id } });
    const sessions = await prisma.editSession.count({ where: { documentId: doc.id } });
    expect(events).toBe(0);
    expect(sessions).toBe(0);

    const statusRes = await request(app)
      .get(`/api/groups/${project.id}/document/status`)
      .set("Authorization", authHeaderFor(leader));
    expect(statusRes.body.resettable).toBe(false);

    const resetRes = await request(app)
      .post(`/api/groups/${project.id}/document/reset`)
      .set("Authorization", authHeaderFor(leader));
    expect(resetRes.status).toBe(409);

    const row = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(row).not.toBeNull();
    const commentRow = await prisma.comment.findFirst({ where: { documentId: doc.id } });
    expect(commentRow).not.toBeNull(); // never cascaded away
  }, 30000);

  it("rejects a non-leader, non-instructor member with 403", async () => {
    const { leader, project } = await setupEditorGroup();
    await initBlankDocument(leader, project.id);
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    await createMembership(member.id, project.id, "MEMBER");

    const resetRes = await request(app)
      .post(`/api/groups/${project.id}/document/reset`)
      .set("Authorization", authHeaderFor(member));
    expect(resetRes.status).toBe(403);

    const row = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(row).not.toBeNull();
  }, 15000);

  it("404s when no document has been started yet", async () => {
    const { leader, project } = await setupEditorGroup();

    const resetRes = await request(app)
      .post(`/api/groups/${project.id}/document/reset`)
      .set("Authorization", authHeaderFor(leader));
    expect(resetRes.status).toBe(404);
  });

  // Regression test for the debounce race identified during implementation: merely OPENING the
  // editor (no typing at all) makes the room resident and, via bindState's legacy-content
  // migration, schedules persistence.ts's debounced persist (3s) — well before this request. If
  // reset didn't cancel that pending persist, it would fire afterward and silently recreate an
  // empty Document row, which would make a template picked in that window (POST
  // /document/init's `update: {}` no-op) silently fail to apply.
  it("does not let a resident room's pending persist resurrect the Document row after reset", async () => {
    const { leader, project } = await setupEditorGroup();
    await initBlankDocument(leader, project.id);

    // Simulates "someone already opened the editor" — makes the room resident via the real
    // getYDoc()/bindState() path (same as a live WebSocket connection would), without producing
    // any EditEvent/EditSession (opening a document produces none — only typing/importing does).
    const room = `group-doc-${project.id}`;
    getYDoc(room, true);
    // bindState's restore (a local DB read + legacy-content migration) is fast but async and
    // unawaited by getYDoc itself; give it a moment to finish and schedule its own debounced
    // persist — well under persistence.ts's 3000ms DEBOUNCE_MS, so nothing has fired yet.
    await new Promise((resolve) => setTimeout(resolve, 800));

    const statusRes = await request(app)
      .get(`/api/groups/${project.id}/document/status`)
      .set("Authorization", authHeaderFor(leader));
    expect(statusRes.body.resettable).toBe(true); // opening alone never touches EditEvent/EditSession

    const resetRes = await request(app)
      .post(`/api/groups/${project.id}/document/reset`)
      .set("Authorization", authHeaderFor(leader));
    expect(resetRes.status).toBe(200);

    // persistence.ts's DEBOUNCE_MS is 3000ms — wait past it and confirm nothing resurrected the row.
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const row = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(row).toBeNull();

    await cleanupRoom(project.id);
  }, 20000);
});

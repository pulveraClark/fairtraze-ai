import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking, type ImportOrigin } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import { createUser, createProject } from "./factories.js";

// Step 2 of the .docx import plan: origin resolution now also recognizes a synthetic
// ImportOrigin marker so a future server-side import route can call ydoc.transact() on a live
// room's Y.Doc and flow through this exact same attribution/diff/classify/session pipeline,
// tagged source: "IMPORT" instead of "LIVE". These tests exercise that directly, without the
// import route itself existing yet.
//
// Kept in its own file (not appended to authorshipCapture.test.ts) deliberately: that file's
// existing registration-lag test replaces prisma.document.upsert with vi.spyOn(...).mockImplementation(...)
// and vi.restoreAllMocks() in its afterEach does not cleanly restore it afterward (observed:
// "prisma.document.upsert is not a function" in every test that ran later in the same file) —
// a pre-existing isolation gap in that test, unrelated to this change. Vitest isolates mocks
// per file, not per describe block, so a separate file sidesteps it without touching that test.
describe("attachAuthorshipTracking — ImportOrigin", () => {
  it("attributes a synthetic ImportOrigin edit with source: IMPORT", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    // Room names are only used as the in-memory `rooms` Map key inside authorshipCapture.ts —
    // attachAuthorshipTracking takes groupId as its own param, so this doesn't need to match
    // `group-doc-<id>`. Made unique (not just `group-doc-${project.id}`) because the global
    // afterEach TRUNCATEs with RESTART IDENTITY, so sequential tests in this file reuse the same
    // project ids; a shared room key would let one test's leftover in-memory state/timers bleed
    // into the next test that happens to land on the same id.
    const room = `test-room-import-origin-${Math.random().toString(36).slice(2)}`;

    await attachAuthorshipTracking(room, project.id, ydoc);

    const importOrigin: ImportOrigin = { type: "import", userId: user.id };
    ydoc.transact(() => {
      const para = new Y.XmlElement("paragraph");
      const text = new Y.XmlText();
      text.insert(0, "imported from a .docx upload");
      para.insert(0, [text]);
      fragment.insert(0, [para]);
    }, importOrigin);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(doc).not.toBeNull();

    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
    const sessions = await prisma.editSession.findMany({ where: { documentId: doc!.id } });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.userId === user.id && e.source === "IMPORT")).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.userId === user.id && s.source === "IMPORT")).toBe(true);
  }, 30000);

  it("keeps a concurrent LIVE session and an IMPORT session for a different user separate", async () => {
    const { user: liveUser } = await createUser({ systemRole: "STUDENT" });
    const { user: importUser } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");
    // See the room-uniqueness comment in the previous test — same reasoning applies here.
    const room = `test-room-live-import-${Math.random().toString(36).slice(2)}`;

    await attachAuthorshipTracking(room, project.id, ydoc);

    const fakeConn = Object.create(WebSocket.prototype) as WebSocket;
    wsUserId.set(fakeConn, liveUser.id);
    const importOrigin: ImportOrigin = { type: "import", userId: importUser.id };

    const typeText = (origin: WebSocket | ImportOrigin, text: string) => {
      ydoc.transact(() => {
        const para = new Y.XmlElement("paragraph");
        const t = new Y.XmlText();
        t.insert(0, text);
        para.insert(0, [t]);
        fragment.insert(fragment.length, [para]);
      }, origin);
    };

    // Interleaved, same room, same timeframe — the case touchSession's source-change branch
    // exists to keep from merging. Different users already have separate session rows by
    // userId alone, so the real thing worth proving is that each user's rows carry only their
    // own source, not a blend.
    typeText(fakeConn, "live typing by liveUser");
    typeText(importOrigin, "imported content for importUser");
    typeText(fakeConn, "more live typing");

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(doc).not.toBeNull();

    const liveEvents = await prisma.editEvent.findMany({ where: { documentId: doc!.id, userId: liveUser.id } });
    const importEvents = await prisma.editEvent.findMany({ where: { documentId: doc!.id, userId: importUser.id } });
    const liveSessions = await prisma.editSession.findMany({ where: { documentId: doc!.id, userId: liveUser.id } });
    const importSessions = await prisma.editSession.findMany({ where: { documentId: doc!.id, userId: importUser.id } });

    expect(liveEvents.length).toBeGreaterThan(0);
    expect(liveEvents.every((e) => e.source === "LIVE")).toBe(true);
    expect(importEvents.length).toBeGreaterThan(0);
    expect(importEvents.every((e) => e.source === "IMPORT")).toBe(true);

    expect(liveSessions.length).toBe(1);
    expect(liveSessions[0].source).toBe("LIVE");
    expect(importSessions.length).toBe(1);
    expect(importSessions[0].source).toBe("IMPORT");
  }, 30000);
});

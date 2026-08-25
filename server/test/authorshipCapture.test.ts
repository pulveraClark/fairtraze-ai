import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import { createUser, createProject } from "./factories.js";

// Regression test for the registration-lag race: attachAuthorshipTracking used to await
// Document.upsert() BEFORE registering its ydoc "update" listener, so any edit made while that
// call was in flight fired with nothing listening and was silently lost forever (Yjs doesn't
// replay past updates to a listener added later). The fix registers the listener synchronously
// and buffers into `state` until documentId resolves — this test proves an edit made *during*
// an artificially slow upsert is still captured once it resolves.
describe("attachAuthorshipTracking — registration-lag race", () => {
  it("captures an edit made while Document.upsert() is still in flight", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    // Simulate the real-world slow-upsert window (observed ~1.9s against a cold Neon
    // connection while diagnosing this bug) without needing fake timers — just delay the real
    // call so a genuine DB round trip still happens underneath.
    //
    // Deliberately NOT vi.spyOn(...)/vi.restoreAllMocks() here: prisma.document is a Proxy-based
    // Prisma Client model delegate (used internally for its extension system), not a plain
    // object with a real own "upsert" property. vi.spyOn's restore snapshots/replays via
    // Object.getOwnPropertyDescriptor/defineProperty, and that round-trip does not reliably
    // survive the Proxy — observed leaving prisma.document.upsert broken ("is not a function")
    // for whatever test ran next in this file. A plain monkey-patch + manual restore in
    // `finally` sidesteps vi's snapshot machinery entirely and is guaranteed to put back the
    // exact original bound function regardless.
    const originalUpsert = prisma.document.upsert.bind(prisma.document);
    prisma.document.upsert = (async (...args: Parameters<typeof prisma.document.upsert>) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return originalUpsert(...args);
    }) as typeof prisma.document.upsert;

    try {
      const ydoc = new Y.Doc();
      const fragment = ydoc.getXmlFragment("default");

      // A fake origin that passes `instanceof WebSocket` without opening a real connection —
      // exactly what authorshipCapture.ts's listener checks (`origin instanceof WebSocket`) and
      // what wsUserId is keyed by.
      const fakeConn = Object.create(WebSocket.prototype) as WebSocket;
      wsUserId.set(fakeConn, user.id);

      const room = `group-doc-${project.id}`;
      const attachPromise = attachAuthorshipTracking(room, project.id, ydoc);

      // Fire a real Yjs edit while the upsert above is still pending (well within the 400ms delay).
      ydoc.transact(() => {
        const para = new Y.XmlElement("paragraph");
        const text = new Y.XmlText();
        text.insert(0, "typed during the slow upsert");
        para.insert(0, [text]);
        fragment.insert(0, [para]);
      }, fakeConn);

      await attachPromise;

      // attachAuthorshipTracking schedules a flush once documentId resolves if anything was
      // buffered; give the real FLUSH_DEBOUNCE_MS (1500ms) time to fire.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      expect(doc).not.toBeNull();

      const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
      const sessions = await prisma.editSession.findMany({ where: { documentId: doc!.id } });

      expect(events.length).toBeGreaterThan(0);
      expect(events.every((e) => e.userId === user.id && e.source === "LIVE")).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions.every((s) => s.userId === user.id)).toBe(true);
    } finally {
      prisma.document.upsert = originalUpsert;
    }
  }, 30000);

  // Sanity check that the manual restore above actually works: if it didn't, this test would
  // fail with "prisma.document.upsert is not a function" — exactly the symptom that used to
  // force new tests into a separate file (see authorshipCaptureImportOrigin.test.ts's header
  // comment) instead of being added here.
  it("prisma.document.upsert still works normally in a later test in this file", async () => {
    const project = await createProject();

    const doc = await prisma.document.upsert({
      where: { groupId: project.id },
      update: {},
      create: { groupId: project.id },
    });

    expect(doc.groupId).toBe(project.id);
  });
});

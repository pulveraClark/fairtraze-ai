import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { yjsPersistence } from "../src/collab/persistence.js";
import { attachAuthorshipTracking, type ImportOrigin } from "../src/collab/authorshipCapture.js";
import { createProject, createUser } from "./factories.js";

// Regression test for the confirmed real-world data-loss incident (project 48): a room whose
// Document.yjsState was populated only via a .docx import (never a real WebSocket) lost that
// content entirely the first time a real connection opened and then closed again before
// bindState's Document.findUnique() + Y.applyUpdate() restore resolved. The fix in
// persistence.ts makes writeState() await a per-room `restoreReady` promise before ever
// persisting, so a fast connect/disconnect on a not-yet-restored room can no longer clobber
// real content with an empty encoded state. Without that fix, this test fails: the imported
// text is gone after the race, replaced by the ~2-byte empty-Y.Doc encoding actually observed
// in production.
describe("persistence.ts — writeState vs. bindState restore race", () => {
  it("does not lose import-only content when the first real connection closes before restore finishes", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const room = `group-doc-${project.id}`;
    const importedText = "imported content that must survive the restore race";

    // 1. Seed real "import-only" content, exactly as a real .docx import + its debounced
    //    persist eventually produces — without ever going through a real WebSocket, matching
    //    the documented "room created purely by import" scenario.
    const seedYdoc = new Y.Doc();
    const seedFragment = seedYdoc.getXmlFragment("default");
    const importOrigin: ImportOrigin = { type: "import", userId: user.id };
    await attachAuthorshipTracking(room, project.id, seedYdoc);
    seedYdoc.transact(() => {
      const para = new Y.XmlElement("paragraph");
      const text = new Y.XmlText();
      text.insert(0, importedText);
      para.insert(0, [text]);
      seedFragment.insert(0, [para]);
    }, importOrigin);

    // Force the real content into Document.yjsState immediately, rather than waiting on
    // persistence.ts's 3s debounce — this is what a real import's eventual debounced persist
    // does to the DB row; how it got there doesn't matter for this test.
    await yjsPersistence.writeState(room, seedYdoc);

    const seeded = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(seeded?.yjsState).toBeTruthy();
    const seededCheck = new Y.Doc();
    Y.applyUpdate(seededCheck, seeded!.yjsState!);
    expect(seededCheck.getXmlFragment("default").toString()).toContain(importedText);

    // 2. Simulate the room being cold in memory (e.g. a server restart since the import) — a
    //    brand-new, empty Y.Doc for the same room, exactly what y-websocket's getYDoc() would
    //    construct for the first real connection.
    const newYdoc = new Y.Doc();

    // 3. Reproduce the race: artificially delay the DB read bindState's restore depends on
    //    (same monkey-patch technique as the existing registration-lag test in
    //    authorshipCapture.test.ts), start bindState WITHOUT awaiting it (mirroring getYDoc's
    //    own fire-and-forget call), then immediately call and await writeState — mirroring
    //    closeConn firing the instant the lone connection to this cold room closes again,
    //    well before the restore below has resolved.
    const originalFindUnique = prisma.document.findUnique.bind(prisma.document);
    prisma.document.findUnique = (async (...args: Parameters<typeof prisma.document.findUnique>) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return originalFindUnique(...args);
    }) as typeof prisma.document.findUnique;

    try {
      const bindPromise = yjsPersistence.bindState(room, newYdoc);
      await yjsPersistence.writeState(room, newYdoc);
      await bindPromise;
    } finally {
      prisma.document.findUnique = originalFindUnique;
    }

    // 4. Assert no loss: the imported text must still be recoverable from Document.yjsState.
    const after = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(after?.yjsState).toBeTruthy();
    const afterCheck = new Y.Doc();
    Y.applyUpdate(afterCheck, after!.yjsState!);
    expect(afterCheck.getXmlFragment("default").toString()).toContain(importedText);
  }, 30000);
});

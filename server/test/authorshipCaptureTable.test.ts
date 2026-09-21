import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { attachAuthorshipTracking } from "../src/collab/authorshipCapture.js";
import { wsUserId } from "../src/collab/connectionRegistry.js";
import { createProject, createUser } from "./factories.js";

// Regression test for the CLAUDE.md table/text-align/color-formatting addition to FairTraze
// Docs: proves that typing inside a TipTap Table node (table > tableRow > tableCell > paragraph
// > text — the same nested-Y.XmlElement shape produced by @tiptap/extension-table) is captured
// by the exact same attribution/diff pipeline as any other text, with no special-casing needed.
// extractPlainText/diffText in authorshipCapture.ts recurse on Yjs node *class* (Y.XmlText vs.
// everything else), never on node *name*, so a table cell is structurally identical to a
// heading or list item from the diffing code's point of view.
describe("attachAuthorshipTracking — table content", () => {
  it("captures typed text inside a table cell as a normal, correctly classified EditEvent", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();

    const ydoc = new Y.Doc();
    const fragment = ydoc.getXmlFragment("default");

    // A fake origin that passes `instanceof WebSocket` without opening a real connection — the
    // same technique used by authorshipCapture.test.ts.
    const fakeConn = Object.create(WebSocket.prototype) as WebSocket;
    const userId = user.id; // EditEvent.userId is a real FK — must reference an actual User row
    wsUserId.set(fakeConn, userId);

    const room = `group-doc-${project.id}`;
    const attachPromise = attachAuthorshipTracking(room, project.id, ydoc);

    // Build a 1x1 table (table > tableRow > tableHeader > paragraph > text), then a sibling
    // paragraph — mirrors the actual node shape @tiptap/extension-table produces.
    ydoc.transact(() => {
      const cellText = new Y.XmlText();
      cellText.insert(0, "Row 1 header content");
      const cellPara = new Y.XmlElement("paragraph");
      cellPara.insert(0, [cellText]);
      const tableHeader = new Y.XmlElement("tableHeader");
      tableHeader.insert(0, [cellPara]);
      const tableRow = new Y.XmlElement("tableRow");
      tableRow.insert(0, [tableHeader]);
      const table = new Y.XmlElement("table");
      table.insert(0, [tableRow]);

      const afterPara = new Y.XmlElement("paragraph");
      const afterText = new Y.XmlText();
      afterText.insert(0, "Text after the table");
      afterPara.insert(0, [afterText]);

      fragment.insert(0, [table, afterPara]);
    }, fakeConn);

    await attachPromise;
    await new Promise((resolve) => setTimeout(resolve, 2000)); // FLUSH_DEBOUNCE_MS + margin

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    expect(doc).not.toBeNull();

    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id }, orderBy: { position: "asc" } });

    // Both the cell text and the sibling paragraph text should be captured as ordinary INSERT
    // events attributed to the same user — no markup, no spurious extra events from the table's
    // structural nodes (table/tableRow/tableHeader contribute no characters of their own).
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.userId === userId && e.eventType === "INSERT")).toBe(true);

    const combinedInserted = events.reduce((sum, e) => sum + e.length, 0);
    // "Row 1 header content" (21) + "Text after the table" (21) = 42 characters total, with no
    // extra characters contributed by table/tableRow/tableHeader tag names leaking into the diff.
    expect(combinedInserted).toBe("Row 1 header content".length + "Text after the table".length);

    // Sensible classification: this is one bulk paste-like insert of new content mid-document —
    // classifyEdit only ever sees insert/delete lengths (never node names), so a table cell's
    // content classifies exactly like a same-length insert anywhere else in the document.
    expect(events.every((e) => e.editType !== null)).toBe(true);
  }, 30000);
});

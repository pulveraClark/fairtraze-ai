import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { computeAuthorshipMap } from "../src/collab/authorshipMap.js";
import { createProject, createUser } from "./factories.js";

// The score (editStats) and the author colours (authorshipMap) both come from the same replay.
// This proves they agree, including when text is handed back to its owner.
describe("score and author colours agree after ownership return", () => {
  it("delete-then-undo by another member: retained characters, spans and totals match", async () => {
    const project = await createProject();
    const { user: a } = await createUser({ systemRole: "STUDENT", name: "A" });
    const { user: b } = await createUser({ systemRole: "STUDENT", name: "B" });
    const doc = await prisma.document.create({ data: { groupId: project.id } });
    const T = (min: number) => new Date(Date.UTC(2026, 10, 10, 2, min, 0));
    const text = "Alpha section written by member A. ".repeat(10); // 350 characters
    const cut = text.slice(0, 200);
    const own = "A new sentence by B, forty characters!!!"; // 40 characters
    await prisma.editEvent.createMany({
      data: [
        { documentId: doc.id, userId: a.id, eventType: "INSERT", position: 0, length: text.length, timestamp: T(0), editType: "SUBSTANTIVE", insertedText: text },
        { documentId: doc.id, userId: b.id, eventType: "DELETE", position: 0, length: 200, timestamp: T(10), deletedText: cut },
        { documentId: doc.id, userId: b.id, eventType: "INSERT", position: 0, length: 200, timestamp: T(11), editType: "SUBSTANTIVE", insertedText: cut },
        { documentId: doc.id, userId: b.id, eventType: "INSERT", position: 350, length: own.length, timestamp: T(12), editType: "SUBSTANTIVE", insertedText: own },
      ],
    });
    const roster = [a, b].map((u) => ({ userId: u.id, studentName: u.name, githubUsername: "" }));
    const stats = await computeDocumentRawStats(doc.id, roster);
    const map = await computeAuthorshipMap(doc.id);

    const sa = stats.find((s) => s.userId === a.id)!, sb = stats.find((s) => s.userId === b.id)!;
    const spanChars = (id: number) => map.spans.filter((s) => s.userId === id).reduce((n, s) => n + (s.end - s.start), 0);

    expect(own).toHaveLength(40);
    expect(sa.retainedChars).toBe(350);
    expect(sb.retainedChars).toBe(40);
    expect(spanChars(a.id)).toBe(sa.retainedChars);
    expect(spanChars(b.id)).toBe(sb.retainedChars);
    expect(map.spans.reduce((n, s) => n + (s.end - s.start), 0)).toBe(390);
    // B's gross inserted text is only what B wrote; the handed-back 200 are not counted.
    expect(sb.totalInsertedChars).toBe(40);
    expect(sb.totalDeletedChars).toBe(200);
    // A's active-day credit comes back with the text (all of it was written on one Manila day).
    expect(sa.retainedCharsByDay["2026-11-10"]).toBe(350);
  }, 60000);
});

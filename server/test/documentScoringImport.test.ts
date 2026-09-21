import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { createUser, createProject } from "./factories.js";

// .docx-import step 3: scoring formula (hybrid policy). No real import route exists yet, so
// these directly construct EditEvent/EditSession rows with source: "IMPORT" via Prisma — same
// approach as authorshipCaptureImportOrigin.test.ts — then run them through the REAL
// computeDocumentRawStats (server/src/collab/editStats.ts) -> computeDocumentTeamReport
// (shared/src/documentScoring.ts) pipeline exactly as analyze.ts does. This is what actually
// exercises the editReplay.ts SlotInfo.source extension end-to-end; the pure-unit tests in
// shared/src/documentScoring.test.ts hand-construct RawDocumentMemberStats and never touch the
// replay/editStats layer.
//
// Kept in its own file (not appended to an existing documentScoring* file) for the same reason
// as step 2's authorshipCaptureImportOrigin.test.ts: separate Vitest files get separate
// mock/module isolation.
describe("computeDocumentRawStats + computeDocumentTeamReport — .docx import scoring", () => {
  it("computes importedRetainedChars and proportional session credit from real replayed EditEvent/EditSession rows", async () => {
    const { user: importUser } = await createUser({ systemRole: "STUDENT" });
    const { user: liveUser } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const document = await prisma.document.create({ data: { groupId: project.id } });

    const t1 = new Date("2024-01-01T09:00:00Z");
    const t2 = new Date("2024-01-02T09:00:00Z");

    await prisma.editEvent.create({
      data: {
        documentId: document.id, userId: importUser.id, eventType: "INSERT",
        position: 0, length: 300, editType: "SUBSTANTIVE", source: "IMPORT", timestamp: t1,
      },
    });
    await prisma.editSession.create({
      data: { documentId: document.id, userId: importUser.id, startedAt: t1, characterCount: 300, source: "IMPORT" },
    });

    await prisma.editEvent.create({
      data: {
        documentId: document.id, userId: liveUser.id, eventType: "INSERT",
        position: 300, length: 100, editType: "SUBSTANTIVE", source: "LIVE", timestamp: t2,
      },
    });
    await prisma.editSession.create({
      data: { documentId: document.id, userId: liveUser.id, startedAt: t2, characterCount: 100, source: "LIVE" },
    });

    const roster = [
      { userId: importUser.id, studentName: "Imported", githubUsername: "" },
      { userId: liveUser.id, studentName: "LiveOnly", githubUsername: "" },
    ];
    const rawStats = await computeDocumentRawStats(document.id, roster);
    const importedRaw = rawStats.find((r) => r.userId === importUser.id)!;
    const liveRaw = rawStats.find((r) => r.userId === liveUser.id)!;

    // Real replay confirms the extension: 300 real inserted+retained IMPORT-source chars.
    expect(importedRaw.retainedChars).toBe(300);
    expect(importedRaw.importedRetainedChars).toBe(300);
    expect(importedRaw.importedWeightedRetainedChars).toBe(300); // substantive weight 1.0
    expect(importedRaw.liveSessionCount).toBe(0);
    expect(importedRaw.sessionCount).toBe(1); // the IMPORT EditSession row still counts in the unchanged total

    expect(liveRaw.retainedChars).toBe(100);
    expect(liveRaw.importedRetainedChars).toBe(0);
    expect(liveRaw.liveSessionCount).toBe(1);

    const report = computeDocumentTeamReport(rawStats);
    const importedScored = report.members.find((m) => m.userId === importUser.id)!;
    const liveScored = report.members.find((m) => m.userId === liveUser.id)!;

    expect(importedScored.importedRetainedChars).toBe(300);
    expect(importedScored.importNote).toContain("Includes 300 characters imported from .docx");

    // LIVE-only member: no import contribution anywhere, importNote null.
    expect(liveScored.importedRetainedChars).toBe(0);
    expect(liveScored.importNote).toBeNull();

    // Both had liveSessionCount effectively producing a non-zero session share; the imported
    // member's extra proportional credit from importedWeightedRetainedChars (300) on top of
    // liveSessionCount 0 should still let them accrue meaningful sessionShare rather than 0.
    expect(importedScored.sessionShare).toBeGreaterThan(0);
  }, 30000);

  it("counts only currently-retained imported characters, not gross inserted, after a self-delete", async () => {
    const { user: importUser } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject();
    const document = await prisma.document.create({ data: { groupId: project.id } });

    const t1 = new Date("2024-01-01T09:00:00Z");
    const t2 = new Date("2024-01-01T09:05:00Z");

    // Import 300 chars, then the same user deletes the first 50 of their own imported chars.
    await prisma.editEvent.create({
      data: {
        documentId: document.id, userId: importUser.id, eventType: "INSERT",
        position: 0, length: 300, editType: "SUBSTANTIVE", source: "IMPORT", timestamp: t1,
      },
    });
    await prisma.editEvent.create({
      data: {
        documentId: document.id, userId: importUser.id, eventType: "DELETE",
        position: 0, length: 50, source: "IMPORT", timestamp: t2,
      },
    });
    await prisma.editSession.create({
      data: { documentId: document.id, userId: importUser.id, startedAt: t1, characterCount: 300, source: "IMPORT" },
    });

    const roster = [{ userId: importUser.id, studentName: "Imported", githubUsername: "" }];
    const rawStats = await computeDocumentRawStats(document.id, roster);
    const importedRaw = rawStats[0];

    // 300 gross inserted, 50 self-deleted -> 250 currently retained, not 300.
    expect(importedRaw.totalInsertedChars).toBe(300);
    expect(importedRaw.retainedChars).toBe(250);
    expect(importedRaw.importedRetainedChars).toBe(250);
    expect(importedRaw.importedWeightedRetainedChars).toBe(250);
  }, 30000);
});

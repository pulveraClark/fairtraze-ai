import { describe, it, expect } from "vitest";
import request from "supertest";
import { setPersistence, docs } from "y-websocket/bin/utils";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { yjsPersistence } from "../src/collab/persistence.js";
import { computeDocumentRawStats } from "../src/collab/editStats.js";
import { computeDocumentTeamReport } from "@shared/documentScoring.js";
import { buildTestDocx } from "./docxFixtures.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const app = createApp();

// Polls the DB for the rows a debounced write is expected to produce, instead of guessing a
// fixed sleep duration. authorshipCapture's flush (1500ms) and persistence.ts's persist debounce
// (3000ms) are real timers doing real async DB work; under a full-suite run (many prior
// sequential test files sharing one Neon connection — see fileParallelism: false in
// vitest.config.ts) that chain can occasionally take longer than any fixed margin comfortable in
// isolation. Polling removes the guessed margin: this only returns once the rows being asserted
// on are actually visible via the same Prisma client, so the assertions below (and the manual
// room cleanup that follows) never race an in-flight write against the next test's global
// TRUNCATE (server/test/setupEnv.ts's afterEach).
async function waitForDocumentEvents(groupId: number, { timeoutMs = 15000, intervalMs = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const doc = await prisma.document.findUnique({ where: { groupId } });
    if (doc) {
      const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
      if (events.length > 0) return doc;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for document/editEvent rows for group ${groupId}`);
}

// The import route reaches the room's live Y.Doc via y-websocket/bin/utils' getYDoc(), which
// only calls persistence.bindState() for a newly-created room if something has previously called
// its module-level setPersistence(). In production that happens once at server boot
// (index.ts -> attachYjsCollabServer -> setPersistence), before any request can arrive.
// createApp() (used here) deliberately excludes the WebSocket server, so nothing in the test
// process sets this — replicate that one piece of startup wiring here.
setPersistence(yjsPersistence);

// .docx-import step 4, end-to-end: a real fixture .docx uploaded through the real route, real
// chunking via docxImport.ts, real EditEvent/EditSession rows with source: "IMPORT" produced by
// the (already-tested, steps 1-3) authorshipCapture.ts pipeline, and the downstream scoring
// pipeline (editStats.ts -> documentScoring.ts) producing the expected importedRetainedChars /
// importNote. Mirrors the real-Prisma-rows pattern already used by
// authorshipCaptureImportOrigin.test.ts and documentScoringImport.test.ts.
describe("POST /api/groups/:id/document/import", () => {
  async function setupEditorGroup() {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id);
    return { instructor, member, project };
  }

  it("imports a real .docx end-to-end: real chunks, real IMPORT-sourced EditEvent/EditSession rows, correct downstream scoring", async () => {
    const { member, project } = await setupEditorGroup();
    const buffer = await buildTestDocx([
      { heading: "Introduction", level: 1 },
      { paragraph: "This is the first imported paragraph, long enough to be substantive." },
      { paragraph: "This is the second imported paragraph, also reasonably long." },
    ]);

    const res = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(member))
      .send({ filename: "notes.docx", fileBase64: buffer.toString("base64") });

    expect(res.status).toBe(200);
    expect(res.body.chunkCount).toBe(3);

    // Wait for both debounced writers to actually finish, not just fire: authorshipCapture's
    // flush (1500ms, writes EditEvent/EditSession) AND persistence.ts's separate, longer persist
    // debounce (3000ms, writes Document.yjsState). The explicit cleanup below still handles the
    // case where persistence's timer is somehow still pending regardless.
    const doc = await waitForDocumentEvents(project.id);

    const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    const sessions = await prisma.editSession.findMany({ where: { documentId: doc.id } });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.userId === member.id && e.source === "IMPORT")).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.userId === member.id && s.source === "IMPORT")).toBe(true);

    const roster = [{ userId: member.id, studentName: member.name, githubUsername: "" }];
    const rawStats = await computeDocumentRawStats(doc.id, roster);
    const report = computeDocumentTeamReport(rawStats);
    const scored = report.members.find((m) => m.userId === member.id)!;

    expect(scored.importedRetainedChars).toBeGreaterThan(0);
    expect(scored.importNote).toContain("characters imported from .docx");

    // This test's room was created by the import route via getYDoc() and no WebSocket ever
    // attached to it, so it's never evicted by y-websocket's own (private) cleanup — the exact
    // "known limitation" documented in CLAUDE.md. Left alone, its pending persistence debounce
    // timer (persistence.ts, 3000ms) can fire after this test ends and the next test's DB
    // TRUNCATE...RESTART IDENTITY has reused this same project id, causing a stray FK error in a
    // later test. Clean it up explicitly here the same way a real WebSocket disconnect
    // (y-websocket's closeConn) would, since that path was never exercised.
    const room = `group-doc-${project.id}`;
    const liveYdoc = docs.get(room);
    if (liveYdoc) {
      await yjsPersistence.writeState(room, liveYdoc);
      liveYdoc.destroy();
      docs.delete(room);
    }
  }, 30000);

  it("rejects a non-member with 403", async () => {
    const { project } = await setupEditorGroup();
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    const buffer = await buildTestDocx([{ paragraph: "Hello." }]);

    const res = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(outsider))
      .send({ filename: "notes.docx", fileBase64: buffer.toString("base64") });

    expect(res.status).toBe(403);
  });

  it("rejects import for a GITHUB-only assignment with 403", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "GITHUB" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id);
    const buffer = await buildTestDocx([{ paragraph: "Hello." }]);

    const res = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(member))
      .send({ filename: "notes.docx", fileBase64: buffer.toString("base64") });

    expect(res.status).toBe(403);
  });

  it("rejects a corrupt/non-docx file with 400", async () => {
    const { member, project } = await setupEditorGroup();
    const garbage = Buffer.from("this is not a zip file at all, just plain text bytes");

    const res = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(member))
      .send({ filename: "notes.docx", fileBase64: garbage.toString("base64") });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid \.docx/i);
  });

  it("rejects a structurally valid but textually empty document with 400", async () => {
    const { member, project } = await setupEditorGroup();
    const buffer = await buildTestDocx([]);

    const res = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(member))
      .send({ filename: "notes.docx", fileBase64: buffer.toString("base64") });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/empty/i);
  });

  it("rejects a file over the 5MB raw-size limit with 413", async () => {
    const { member, project } = await setupEditorGroup();
    // 5.5MB of arbitrary bytes — doesn't need to be a valid docx; the size check runs before
    // parsing. Its base64 form (~7.3MB) still fits under the route's 8MB JSON body-parser limit,
    // so this specifically exercises documents.ts's own post-decode check, not the body-parser backstop.
    const oversized = Buffer.alloc(5.5 * 1024 * 1024, "a");

    const res = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(member))
      .send({ filename: "notes.docx", fileBase64: oversized.toString("base64") });

    expect(res.status).toBe(413);
  }, 30000);

  it("rejects a non-.docx filename with 400", async () => {
    const { member, project } = await setupEditorGroup();
    const buffer = await buildTestDocx([{ paragraph: "Hello." }]);

    const res = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(member))
      .send({ filename: "notes.pdf", fileBase64: buffer.toString("base64") });

    expect(res.status).toBe(400);
  });
});

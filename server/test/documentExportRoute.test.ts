import { describe, it, expect } from "vitest";
import request from "supertest";
import { setPersistence, docs } from "y-websocket/bin/utils";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { yjsPersistence } from "../src/collab/persistence.js";
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

// createApp() excludes the WebSocket server (see documentImportRoute.test.ts's identical comment)
// — replicate the one piece of startup wiring the import route needs, even though the export
// route itself never calls getYDoc()/setPersistence at all. Needed here only to seed real content
// via the import route before exporting it.
setPersistence(yjsPersistence);

async function waitForDocumentEvents(groupId: number, { timeoutMs = 15000, intervalMs = 200 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const doc = await prisma.document.findUnique({ where: { groupId } });
    if (doc) {
      const events = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
      const sessions = await prisma.editSession.findMany({ where: { documentId: doc.id } });
      if (events.length > 0 && sessions.length > 0) return doc;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for document/editEvent/editSession rows for group ${groupId}`);
}

describe("GET /api/groups/:id/document/export", () => {
  async function setupEditorGroup() {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id);
    return { instructor, member, project };
  }

  // Core "clean read" guarantee: export must never create EditEvent/EditSession rows or otherwise
  // touch the document's persisted state, proving readDocumentStructure's scratch Y.Doc never
  // triggers authorshipCapture.ts (which it would if it went through getYDoc() the way the import
  // route deliberately does).
  it("downloads a real .docx and leaves EditEvent/EditSession/Document rows byte-for-byte unchanged", async () => {
    const { member, project } = await setupEditorGroup();
    const buffer = await buildTestDocx([
      { heading: "Introduction", level: 1 },
      { paragraph: "This is a real imported paragraph, long enough to be substantive." },
    ]);

    const importRes = await request(app)
      .post(`/api/groups/${project.id}/document/import`)
      .set("Authorization", authHeaderFor(member))
      .send({ filename: "notes.docx", fileBase64: buffer.toString("base64") });
    expect(importRes.status).toBe(200);

    const doc = await waitForDocumentEvents(project.id);

    // Force the debounced yjsState persist to land (mirrors documentImportRoute.test.ts's own
    // manual room cleanup) so the export below reads real yjsState, not a stale empty row.
    const room = `group-doc-${project.id}`;
    const liveYdoc = docs.get(room);
    if (liveYdoc) {
      await yjsPersistence.writeState(room, liveYdoc);
      liveYdoc.destroy();
      docs.delete(room);
    }

    const beforeEvents = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    const beforeSessions = await prisma.editSession.findMany({ where: { documentId: doc.id } });
    const beforeDoc = await prisma.document.findUnique({ where: { groupId: project.id } });

    const exportRes = await request(app)
      .get(`/api/groups/${project.id}/document/export?format=docx`)
      .set("Authorization", authHeaderFor(member))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(exportRes.headers["content-disposition"]).toContain("attachment");
    const body = exportRes.body as Buffer;
    expect(body.length).toBeGreaterThan(0);
    expect(body.subarray(0, 2).toString("ascii")).toBe("PK");

    // Zero mutation: same row counts, same yjsState bytes, same updatedAt.
    const afterEvents = await prisma.editEvent.findMany({ where: { documentId: doc.id } });
    const afterSessions = await prisma.editSession.findMany({ where: { documentId: doc.id } });
    const afterDoc = await prisma.document.findUnique({ where: { groupId: project.id } });

    expect(afterEvents.length).toBe(beforeEvents.length);
    expect(afterSessions.length).toBe(beforeSessions.length);
    expect(afterDoc!.updatedAt.getTime()).toBe(beforeDoc!.updatedAt.getTime());
    expect(Buffer.from(afterDoc!.yjsState!).equals(Buffer.from(beforeDoc!.yjsState!))).toBe(true);
  }, 30000);

  it("rejects a non-member with 403", async () => {
    const { project } = await setupEditorGroup();
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/export?format=docx`)
      .set("Authorization", authHeaderFor(outsider));

    expect(res.status).toBe(403);
  });

  it("allows the class instructor (read-only) to export", async () => {
    const { instructor, project } = await setupEditorGroup();
    await prisma.document.create({ data: { groupId: project.id } });

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/export?format=docx`)
      .set("Authorization", authHeaderFor(instructor));

    expect(res.status).toBe(200);
  });

  it("rejects export for a GITHUB-only assignment with 403", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "GITHUB" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id);

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/export?format=docx`)
      .set("Authorization", authHeaderFor(member));

    expect(res.status).toBe(403);
  });

  it("404s when the group hasn't started its document yet", async () => {
    const { member, project } = await setupEditorGroup();

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/export?format=docx`)
      .set("Authorization", authHeaderFor(member));

    expect(res.status).toBe(404);
  });

  it("rejects an unsupported format with 400", async () => {
    const { member, project } = await setupEditorGroup();
    await prisma.document.create({ data: { groupId: project.id } });

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/export?format=pdf`)
      .set("Authorization", authHeaderFor(member));

    expect(res.status).toBe(400);
  });
});

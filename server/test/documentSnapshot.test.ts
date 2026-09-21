import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const app = createApp();

// Step 1 of the document revision-history design: DocumentSnapshot is a point-in-time copy of
// Document.yjsState, written whenever an analysis run creates a new Report for an EDITOR/COMBINED
// assignment. The write is a plain Prisma read + insert of the already-current, already-debounce-
// persisted yjsState column (see server/src/collab/persistence.ts) — it must never touch the live
// Y.Doc, never call getYDoc(), and never register a Yjs update listener, so it has zero
// interaction with server/src/collab/authorshipCapture.ts or the live collab room. These tests
// confirm both the persistence behavior and that invariant.
describe("DocumentSnapshot persistence", () => {
  async function seedEditorActivity(documentId: number, userId: number) {
    await prisma.editEvent.create({
      data: {
        documentId,
        userId,
        eventType: "INSERT",
        position: 0,
        length: 20,
        editType: "SUBSTANTIVE",
        insertedText: "some real paragraph.",
      },
    });
    await prisma.editSession.create({
      data: {
        documentId,
        userId,
        startedAt: new Date(Date.now() - 60_000),
        endedAt: new Date(),
        characterCount: 20,
      },
    });
  }

  it("EDITOR analyze run writes one DocumentSnapshot row whose bytes match Document.yjsState, linked to the new Report", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id, "LEADER");

    const yjsState = Buffer.from([1, 2, 3, 4, 5]);
    const document = await prisma.document.create({ data: { groupId: project.id, yjsState } });
    await seedEditorActivity(document.id, member.id);

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);

    const report = await prisma.report.findFirst({ where: { projectId: project.id }, orderBy: { generatedAt: "desc" } });
    expect(report).not.toBeNull();

    const snapshots = await prisma.documentSnapshot.findMany({ where: { reportId: report!.id } });
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].documentId).toBe(document.id);
    expect(Buffer.from(snapshots[0].yjsState).equals(yjsState)).toBe(true);
  }, 40000);

  // Both the EDITOR and COMBINED branches of POST /api/projects/:id/analyze call the exact same
  // writeDocumentSnapshot(documentId, reportId) helper right next to writeDocumentContributionRows
  // (server/src/routes/analyze.ts) — there is no branch-specific snapshot logic to duplicate
  // coverage for. The COMBINED branch additionally requires a real reachable GitHub repo/token,
  // which existing tests in this suite (e.g. contributionTables.test.ts) also don't exercise for
  // the same reason, so it's intentionally left uncovered here.

  it("does not write a DocumentSnapshot when the Document has no yjsState yet (legacy content only)", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await prisma.document.create({ data: { groupId: project.id } }); // yjsState left null

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);

    const report = await prisma.report.findFirst({ where: { projectId: project.id } });
    const snapshots = await prisma.documentSnapshot.findMany({ where: { reportId: report!.id } });
    expect(snapshots.length).toBe(0);
  }, 20000);

  it("does not write a DocumentSnapshot when the project has no Document row at all", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);

    const report = await prisma.report.findFirst({ where: { projectId: project.id } });
    const snapshots = await prisma.documentSnapshot.findMany({ where: { reportId: report!.id } });
    expect(snapshots.length).toBe(0);
  }, 20000);

  it("two sequential analysis runs (no WebSocket/collab room ever opened) each produce their own snapshot", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(member.id, project.id, "LEADER");

    const document = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from([1]) } });
    await seedEditorActivity(document.id, member.id);

    const res1 = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res1.status).toBe(200);

    // Simulate the document changing between analysis runs purely via the debounced-persist
    // column — exactly what writeDocumentSnapshot is designed to read, with no live room involved.
    await prisma.document.update({ where: { id: document.id }, data: { yjsState: Buffer.from([2]) } });

    const res2 = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res2.status).toBe(200);

    const snapshots = await prisma.documentSnapshot.findMany({
      where: { documentId: document.id },
      orderBy: { createdAt: "asc" },
    });
    expect(snapshots.length).toBe(2);
    expect(Buffer.from(snapshots[0].yjsState).equals(Buffer.from([1]))).toBe(true);
    expect(Buffer.from(snapshots[1].yjsState).equals(Buffer.from([2]))).toBe(true);
  }, 40000);

  it("the snapshot-writing code path never imports getYDoc/y-websocket/authorshipCapture — it must only read the persisted yjsState column", () => {
    const analyzeSrcPath = fileURLToPath(new URL("../src/routes/analyze.ts", import.meta.url));
    const src = readFileSync(analyzeSrcPath, "utf-8");
    const importLines = src.split("\n").filter((line) => line.trimStart().startsWith("import "));
    expect(src).toContain("writeDocumentSnapshot");
    for (const line of importLines) {
      expect(line).not.toMatch(/getYDoc|y-websocket|authorshipCapture/);
    }
  });
});

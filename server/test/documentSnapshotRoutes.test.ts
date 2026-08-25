import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { Y } from "../src/collab/yjsCjs.js";
import { readDocumentStructure } from "../src/collab/documentExport.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const app = createApp();

// Step 2 of the document revision-history design: the read/reconstruction routes for
// DocumentSnapshot (written in Step 1 — see documentSnapshot.test.ts). These routes only ever
// read the already-stored yjsState column via readDocumentStructure's scratch-Y.Doc pattern —
// zero interaction with the live collab room or authorshipCapture.ts.

// Same style as documentExport.test.ts's buildSampleYjsState() (not exported from that file, so
// reproduced minimally here): a heading + a paragraph is enough to prove faithful reconstruction
// without duplicating that file's full fixture (table/list/marks already covered there).
function buildSampleYjsState(title: string): Uint8Array {
  const ydoc = new Y.Doc();
  const fragment = ydoc.getXmlFragment("default");
  ydoc.transact(() => {
    const heading = new Y.XmlElement("heading");
    heading.setAttribute("level", 1 as unknown as string);
    const headingText = new Y.XmlText();
    headingText.insert(0, title);
    heading.insert(0, [headingText]);

    const para = new Y.XmlElement("paragraph");
    const paraText = new Y.XmlText();
    paraText.insert(0, "Some historical paragraph content.");
    para.insert(0, [paraText]);

    fragment.insert(0, [heading, para]);
  });
  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return state;
}

async function setupEditorGroup(overrides: { sourceType?: "GITHUB" | "EDITOR" | "COMBINED" } = {}) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: overrides.sourceType ?? "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(member.id, project.id);
  return { instructor, member, outsider, project };
}

describe("GET /api/groups/:id/document/snapshots", () => {
  it("lists snapshots newest first", async () => {
    const { member, project } = await setupEditorGroup();
    const document = await prisma.document.create({
      data: { groupId: project.id, yjsState: Buffer.from(buildSampleYjsState("Doc")) },
    });

    const older = await prisma.documentSnapshot.create({
      data: { documentId: document.id, yjsState: Buffer.from([1]), createdAt: new Date(Date.now() - 60_000) },
    });
    const newer = await prisma.documentSnapshot.create({
      data: { documentId: document.id, yjsState: Buffer.from([2]), createdAt: new Date() },
    });

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots`)
      .set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(200);
    expect(res.body.snapshots.map((s: { id: number }) => s.id)).toEqual([newer.id, older.id]);
    expect(res.body.snapshots[0]).toHaveProperty("createdAt");
    expect(res.body.snapshots[0]).toHaveProperty("reportId");
  });

  it("returns an empty list when the group hasn't started its document yet (not an error)", async () => {
    const { member, project } = await setupEditorGroup();
    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots`)
      .set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toEqual([]);
  });

  it("rejects a non-member with 403", async () => {
    const { outsider, project } = await setupEditorGroup();
    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots`)
      .set("Authorization", authHeaderFor(outsider));
    expect(res.status).toBe(403);
  });

  it("rejects a GITHUB-only assignment's group with 403", async () => {
    const { member, project } = await setupEditorGroup({ sourceType: "GITHUB" });
    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots`)
      .set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(403);
  });
});

describe("GET /api/groups/:id/document/snapshots/:snapshotId", () => {
  it("reconstructs a snapshot's content matching what readDocumentStructure produces directly for the same bytes", async () => {
    const { member, project } = await setupEditorGroup();
    const yjsState = buildSampleYjsState("Historical Title");
    const document = await prisma.document.create({ data: { groupId: project.id, yjsState: Buffer.from(yjsState) } });
    const snapshot = await prisma.documentSnapshot.create({
      data: { documentId: document.id, yjsState: Buffer.from(yjsState) },
    });

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots/${snapshot.id}`)
      .set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(snapshot.id);

    const expectedBlocks = readDocumentStructure({ content: "", yjsState });
    expect(res.body.blocks).toEqual(expectedBlocks);
    expect(res.body.blocks[0]).toMatchObject({ kind: "heading", level: 1 });
    expect(res.body.blocks[0].runs.map((r: { text: string }) => r.text).join("")).toBe("Historical Title");
  });

  it("rejects a non-member with 403", async () => {
    const { outsider, project } = await setupEditorGroup();
    const document = await prisma.document.create({
      data: { groupId: project.id, yjsState: Buffer.from(buildSampleYjsState("Doc")) },
    });
    const snapshot = await prisma.documentSnapshot.create({
      data: { documentId: document.id, yjsState: Buffer.from([1]) },
    });

    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots/${snapshot.id}`)
      .set("Authorization", authHeaderFor(outsider));
    expect(res.status).toBe(403);
  });

  it("rejects a GITHUB-only assignment's group with 403", async () => {
    const { member, project } = await setupEditorGroup({ sourceType: "GITHUB" });
    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots/1`)
      .set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(403);
  });

  it("404s when the group hasn't started its document yet", async () => {
    const { member, project } = await setupEditorGroup();
    const res = await request(app)
      .get(`/api/groups/${project.id}/document/snapshots/1`)
      .set("Authorization", authHeaderFor(member));
    expect(res.status).toBe(404);
  });

  it("404s (not 403) when the snapshot id belongs to a different group's document, without leaking that it exists elsewhere", async () => {
    const { member: memberA, project: projectA } = await setupEditorGroup();
    const { member: memberB, project: projectB } = await setupEditorGroup();

    const documentA = await prisma.document.create({
      data: { groupId: projectA.id, yjsState: Buffer.from(buildSampleYjsState("A")) },
    });
    const snapshotA = await prisma.documentSnapshot.create({
      data: { documentId: documentA.id, yjsState: Buffer.from(buildSampleYjsState("Secret A content")) },
    });
    // Group B needs its own Document row so the route reaches the ownership check rather than
    // 404ing earlier on "hasn't started their document yet".
    await prisma.document.create({ data: { groupId: projectB.id, yjsState: Buffer.from(buildSampleYjsState("B")) } });

    const res = await request(app)
      .get(`/api/groups/${projectB.id}/document/snapshots/${snapshotA.id}`)
      .set("Authorization", authHeaderFor(memberB));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Secret A content");
    expect(res.body).not.toHaveProperty("blocks");

    // Sanity: the same snapshot id IS reachable by an actual member of group A.
    const okRes = await request(app)
      .get(`/api/groups/${projectA.id}/document/snapshots/${snapshotA.id}`)
      .set("Authorization", authHeaderFor(memberA));
    expect(okRes.status).toBe(200);
  });
});

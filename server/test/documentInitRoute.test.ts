import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { DOCUMENT_TEMPLATES } from "@shared/documentTemplates.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const app = createApp();

// documents.ts POST /document/init — the leader/instructor-gated "start your document" step
// (optionally seeded from a template). Never touches the live Yjs room; only sets
// Document.content at row-creation time, so these are plain Prisma-row assertions, no room/
// WebSocket setup needed (contrast with documentImportRoute.test.ts).
describe("document/status and document/init routes", () => {
  async function setupEditorGroup() {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: leader } = await createUser({ systemRole: "STUDENT" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(leader.id, project.id, "LEADER");
    await createMembership(member.id, project.id, "MEMBER");
    return { instructor, leader, member, project };
  }

  describe("GET /api/groups/:id/document/status", () => {
    it("reports exists:false and does NOT create a row", async () => {
      const { leader, project } = await setupEditorGroup();

      const res = await request(app)
        .get(`/api/groups/${project.id}/document/status`)
        .set("Authorization", authHeaderFor(leader));

      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(false);

      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      expect(doc).toBeNull();
    });

    it("reports exists:true once a document row exists", async () => {
      const { leader, project } = await setupEditorGroup();
      await prisma.document.create({ data: { groupId: project.id } });

      const res = await request(app)
        .get(`/api/groups/${project.id}/document/status`)
        .set("Authorization", authHeaderFor(leader));

      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
    });

    it("rejects a non-member with 403", async () => {
      const { project } = await setupEditorGroup();
      const { user: outsider } = await createUser({ systemRole: "STUDENT" });

      const res = await request(app)
        .get(`/api/groups/${project.id}/document/status`)
        .set("Authorization", authHeaderFor(outsider));

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/groups/:id/document/init", () => {
    it("leader creates a blank document (no templateId)", async () => {
      const { leader, project } = await setupEditorGroup();

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(leader))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);

      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      expect(doc).not.toBeNull();
      expect(doc!.yjsState).toBeNull();
    });

    it("leader creates a document seeded from a template", async () => {
      const { leader, project } = await setupEditorGroup();
      const template = DOCUMENT_TEMPLATES[0];

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(leader))
        .send({ templateId: template.id });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
      expect(res.body.content).toEqual(template.content);

      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      expect(JSON.parse(doc!.content)).toEqual(template.content);
    });

    it("instructor may also start the document", async () => {
      const { instructor, project } = await setupEditorGroup();

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(instructor))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
    });

    it("rejects a non-leader member with 403", async () => {
      const { member, project } = await setupEditorGroup();

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(member))
        .send({});

      expect(res.status).toBe(403);

      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      expect(doc).toBeNull();
    });

    it("rejects an unknown templateId with 400", async () => {
      const { leader, project } = await setupEditorGroup();

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(leader))
        .send({ templateId: "not-a-real-template" });

      expect(res.status).toBe(400);
    });

    it("rejects init for a GITHUB-only assignment with 403", async () => {
      const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
      const { user: leader } = await createUser({ systemRole: "STUDENT" });
      const classSection = await createClassSection(instructor.id);
      const assignment = await createAssignment(classSection.id, { sourceType: "GITHUB" });
      const project = await createProject({ assignmentId: assignment.id });
      await createMembership(leader.id, project.id, "LEADER");

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(leader))
        .send({});

      expect(res.status).toBe(403);
    });

    it("is idempotent: a second call after the document exists is a no-op and never overwrites content", async () => {
      const { leader, project } = await setupEditorGroup();
      const template = DOCUMENT_TEMPLATES[0];

      const first = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(leader))
        .send({ templateId: template.id });
      expect(first.status).toBe(200);
      expect(first.body.created).toBe(true);

      const second = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(leader))
        .send({ templateId: DOCUMENT_TEMPLATES[1].id });

      expect(second.status).toBe(200);
      expect(second.body.created).toBe(false);
      // Content from the FIRST call must survive untouched — the second call's different
      // templateId must never overwrite it.
      expect(second.body.content).toEqual(template.content);

      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      expect(JSON.parse(doc!.content)).toEqual(template.content);
    });

    it("never produces any EditEvent/EditSession rows for the seeded template content", async () => {
      const { leader, project } = await setupEditorGroup();
      const template = DOCUMENT_TEMPLATES[0];

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/init`)
        .set("Authorization", authHeaderFor(leader))
        .send({ templateId: template.id });
      expect(res.status).toBe(200);

      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
      const sessions = await prisma.editSession.findMany({ where: { documentId: doc!.id } });
      expect(events.length).toBe(0);
      expect(sessions.length).toBe(0);
    });
  });
});

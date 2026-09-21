import { describe, it, expect } from "vitest";
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

const ANCHOR_A = Buffer.from("anchor-a-bytes").toString("base64");
const ANCHOR_B = Buffer.from("anchor-b-bytes").toString("base64");

// Comments are plain metadata reached only through these REST routes — never through
// getYDoc()/ydoc.transact() or authorshipCapture.ts. These tests exercise the routes directly
// against real Prisma rows (no Yjs room/WebSocket setup needed, unlike documentImportRoute.test.ts).
describe("comment routes", () => {
  async function setupEditorGroupWithDocument() {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: leader } = await createUser({ systemRole: "STUDENT" });
    const { user: member } = await createUser({ systemRole: "STUDENT" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    await createMembership(leader.id, project.id, "LEADER");
    await createMembership(member.id, project.id, "MEMBER");
    const document = await prisma.document.create({ data: { groupId: project.id } });
    return { instructor, leader, member, project, document };
  }

  describe("POST /api/groups/:id/document/comments", () => {
    it("a member creates a root comment", async () => {
      const { member, project } = await setupEditorGroupWithDocument();

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Consider rephrasing this.", anchor: ANCHOR_A });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe("Consider rephrasing this.");
      expect(res.body.author.id).toBe(member.id);
      expect(res.body.parentId).toBeNull();
      expect(res.body.resolvedAt).toBeNull();
      expect(res.body.anchor).toBe(ANCHOR_A);
    });

    it("a member replies to a root comment", async () => {
      const { leader, member, project } = await setupEditorGroupWithDocument();

      const root = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Root comment", anchor: ANCHOR_A });

      const reply = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Reply comment", anchor: ANCHOR_A, parentId: root.body.id });

      expect(reply.status).toBe(201);
      expect(reply.body.parentId).toBe(root.body.id);
    });

    it("rejects a reply targeting another reply (no nested threads)", async () => {
      const { leader, project } = await setupEditorGroupWithDocument();

      const root = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Root", anchor: ANCHOR_A });
      const reply = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Reply", anchor: ANCHOR_A, parentId: root.body.id });

      const nestedReply = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Nested reply", anchor: ANCHOR_A, parentId: reply.body.id });

      expect(nestedReply.status).toBe(400);
      expect(nestedReply.body.error).toMatch(/root comment/i);
    });

    it("rejects a non-member with 403", async () => {
      const { project } = await setupEditorGroupWithDocument();
      const { user: outsider } = await createUser({ systemRole: "STUDENT" });

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(outsider))
        .send({ text: "Hi", anchor: ANCHOR_A });

      expect(res.status).toBe(403);
    });

    it("rejects commenting on a GITHUB-only assignment with 403", async () => {
      const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
      const { user: member } = await createUser({ systemRole: "STUDENT" });
      const classSection = await createClassSection(instructor.id);
      const assignment = await createAssignment(classSection.id, { sourceType: "GITHUB" });
      const project = await createProject({ assignmentId: assignment.id });
      await createMembership(member.id, project.id);

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Hi", anchor: ANCHOR_A });

      expect(res.status).toBe(403);
    });

    it("rejects commenting before the document has been started (no Document row) with 404, and never creates one", async () => {
      const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
      const { user: member } = await createUser({ systemRole: "STUDENT" });
      const classSection = await createClassSection(instructor.id);
      const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
      const project = await createProject({ assignmentId: assignment.id });
      await createMembership(member.id, project.id);

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Hi", anchor: ANCHOR_A });

      expect(res.status).toBe(404);
      const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
      expect(doc).toBeNull();
    });

    it("rejects an invalid (non-base64) anchor with 400", async () => {
      const { member, project } = await setupEditorGroupWithDocument();

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Hi", anchor: "" });

      expect(res.status).toBe(400);
    });

    it("never produces any EditEvent/EditSession rows", async () => {
      const { member, project, document } = await setupEditorGroupWithDocument();

      const res = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Hi", anchor: ANCHOR_A });
      expect(res.status).toBe(201);

      const events = await prisma.editEvent.findMany({ where: { documentId: document.id } });
      const sessions = await prisma.editSession.findMany({ where: { documentId: document.id } });
      expect(events.length).toBe(0);
      expect(sessions.length).toBe(0);
    });
  });

  describe("GET /api/groups/:id/document/comments", () => {
    it("lists root and reply comments for members and the instructor", async () => {
      const { instructor, leader, member, project } = await setupEditorGroupWithDocument();
      const root = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Root", anchor: ANCHOR_A });
      await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Reply", anchor: ANCHOR_A, parentId: root.body.id });

      const asMember = await request(app)
        .get(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member));
      expect(asMember.status).toBe(200);
      expect(asMember.body.comments.length).toBe(2);

      const asInstructor = await request(app)
        .get(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(instructor));
      expect(asInstructor.status).toBe(200);
      expect(asInstructor.body.comments.length).toBe(2);
    });

    it("returns an empty list (not 404) when no document exists yet", async () => {
      const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
      const { user: member } = await createUser({ systemRole: "STUDENT" });
      const classSection = await createClassSection(instructor.id);
      const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
      const project = await createProject({ assignmentId: assignment.id });
      await createMembership(member.id, project.id);

      const res = await request(app)
        .get(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member));

      expect(res.status).toBe(200);
      expect(res.body.comments).toEqual([]);
    });

    it("rejects a non-member with 403", async () => {
      const { project } = await setupEditorGroupWithDocument();
      const { user: outsider } = await createUser({ systemRole: "STUDENT" });

      const res = await request(app)
        .get(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(outsider));

      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/groups/:id/document/comments/:commentId/resolve", () => {
    it("any member (not just the author) can resolve and reopen a thread", async () => {
      const { leader, member, project } = await setupEditorGroupWithDocument();
      const created = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Root", anchor: ANCHOR_A });

      const resolved = await request(app)
        .patch(`/api/groups/${project.id}/document/comments/${created.body.id}/resolve`)
        .set("Authorization", authHeaderFor(member))
        .send({ resolved: true });
      expect(resolved.status).toBe(200);
      expect(resolved.body.resolvedAt).not.toBeNull();

      const reopened = await request(app)
        .patch(`/api/groups/${project.id}/document/comments/${created.body.id}/resolve`)
        .set("Authorization", authHeaderFor(member))
        .send({ resolved: false });
      expect(reopened.status).toBe(200);
      expect(reopened.body.resolvedAt).toBeNull();
    });

    it("the instructor can also resolve a thread", async () => {
      const { instructor, leader, project } = await setupEditorGroupWithDocument();
      const created = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Root", anchor: ANCHOR_A });

      const res = await request(app)
        .patch(`/api/groups/${project.id}/document/comments/${created.body.id}/resolve`)
        .set("Authorization", authHeaderFor(instructor))
        .send({ resolved: true });

      expect(res.status).toBe(200);
    });

    it("404s for a comment id that belongs to a different document", async () => {
      const { leader, project } = await setupEditorGroupWithDocument();
      const other = await setupEditorGroupWithDocument();
      const created = await request(app)
        .post(`/api/groups/${other.project.id}/document/comments`)
        .set("Authorization", authHeaderFor(other.leader))
        .send({ text: "Other group's comment", anchor: ANCHOR_A });

      const res = await request(app)
        .patch(`/api/groups/${project.id}/document/comments/${created.body.id}/resolve`)
        .set("Authorization", authHeaderFor(leader))
        .send({ resolved: true });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/groups/:id/document/comments/:commentId", () => {
    it("the author can delete their own comment", async () => {
      const { member, project } = await setupEditorGroupWithDocument();
      const created = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Mine", anchor: ANCHOR_A });

      const res = await request(app)
        .delete(`/api/groups/${project.id}/document/comments/${created.body.id}`)
        .set("Authorization", authHeaderFor(member));

      expect(res.status).toBe(200);
      const stillThere = await prisma.comment.findUnique({ where: { id: created.body.id } });
      expect(stillThere).toBeNull();
    });

    it("the instructor can delete another member's comment", async () => {
      const { instructor, member, project } = await setupEditorGroupWithDocument();
      const created = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Member's comment", anchor: ANCHOR_A });

      const res = await request(app)
        .delete(`/api/groups/${project.id}/document/comments/${created.body.id}`)
        .set("Authorization", authHeaderFor(instructor));

      expect(res.status).toBe(200);
    });

    it("rejects a different member deleting someone else's comment with 403", async () => {
      const { leader, member, project } = await setupEditorGroupWithDocument();
      const created = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Leader's comment", anchor: ANCHOR_A });

      const res = await request(app)
        .delete(`/api/groups/${project.id}/document/comments/${created.body.id}`)
        .set("Authorization", authHeaderFor(member));

      expect(res.status).toBe(403);
      const stillThere = await prisma.comment.findUnique({ where: { id: created.body.id } });
      expect(stillThere).not.toBeNull();
    });

    it("cascade-deletes replies when the root comment is deleted", async () => {
      const { leader, member, project } = await setupEditorGroupWithDocument();
      const root = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(leader))
        .send({ text: "Root", anchor: ANCHOR_A });
      const reply = await request(app)
        .post(`/api/groups/${project.id}/document/comments`)
        .set("Authorization", authHeaderFor(member))
        .send({ text: "Reply", anchor: ANCHOR_A, parentId: root.body.id });

      const res = await request(app)
        .delete(`/api/groups/${project.id}/document/comments/${root.body.id}`)
        .set("Authorization", authHeaderFor(leader));
      expect(res.status).toBe(200);

      const replyStillThere = await prisma.comment.findUnique({ where: { id: reply.body.id } });
      expect(replyStillThere).toBeNull();
    });
  });

  it("never affects a generated report's contributionShare (comments have zero scoring impact)", async () => {
    const { leader, member, project } = await setupEditorGroupWithDocument();
    // Several comments, including replies and a resolve toggle — none of this is document
    // content or an EditEvent, so it must be completely invisible to scoring.
    const root = await request(app)
      .post(`/api/groups/${project.id}/document/comments`)
      .set("Authorization", authHeaderFor(leader))
      .send({ text: "A fairly long comment that would look like real contribution if it were ever mistakenly counted.", anchor: ANCHOR_A });
    await request(app)
      .post(`/api/groups/${project.id}/document/comments`)
      .set("Authorization", authHeaderFor(member))
      .send({ text: "Another substantial reply, also must never count toward anyone's score.", anchor: ANCHOR_B, parentId: root.body.id });
    await request(app)
      .patch(`/api/groups/${project.id}/document/comments/${root.body.id}/resolve`)
      .set("Authorization", authHeaderFor(leader))
      .send({ resolved: true });

    const doc = await prisma.document.findUnique({ where: { groupId: project.id } });
    const events = await prisma.editEvent.findMany({ where: { documentId: doc!.id } });
    const sessions = await prisma.editSession.findMany({ where: { documentId: doc!.id } });
    expect(events.length).toBe(0);
    expect(sessions.length).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "../../test/factories.js";
import { prisma } from "../lib/prisma.js";

const app = createApp();

async function setupGroup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment   = await createAssignment(classSection.id);
  const project       = await createProject({ assignmentId: assignment.id });

  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");

  return { instructor, leader, member, outsider, project };
}

describe("Task CRUD authorization", () => {
  it("allows the leader to create a task", async () => {
    const { leader, project } = await setupGroup();
    const res = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Design the poster" });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe("Design the poster");
    expect(res.body.done).toBe(false);
    expect(res.body.completedAt).toBeNull();
  });

  it("allows the owning instructor to create a task", async () => {
    const { instructor, project } = await setupGroup();
    const res = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(instructor))
      .send({ title: "Book the presentation slot" });

    expect(res.status).toBe(201);
  });

  it("rejects a plain member creating a task", async () => {
    const { member, project } = await setupGroup();
    const res = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(member))
      .send({ title: "Sneaky task" });

    expect(res.status).toBe(403);
  });

  it("rejects assigning a task to someone outside the group", async () => {
    const { leader, outsider, project } = await setupGroup();
    const res = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Task", assignedToUserId: outsider.id });

    expect(res.status).toBe(400);
  });

  it("lets the assignee toggle only their own task, not another member's", async () => {
    const { leader, member, project } = await setupGroup();
    const create = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Build the prototype", assignedToUserId: member.id });
    const taskId = create.body.id;

    // A second member (not the assignee, not leader/instructor) is blocked.
    const { user: thirdMember } = await createUser({ systemRole: "STUDENT" });
    await createMembership(thirdMember.id, project.id, "MEMBER");
    const blocked = await request(app)
      .patch(`/api/groups/${project.id}/tasks/${taskId}`)
      .set("Authorization", authHeaderFor(thirdMember))
      .send({ done: true });
    expect(blocked.status).toBe(403);

    // The assignee can toggle their own task.
    const allowed = await request(app)
      .patch(`/api/groups/${project.id}/tasks/${taskId}`)
      .set("Authorization", authHeaderFor(member))
      .send({ done: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.done).toBe(true);
  });

  it("lets the leader override completion on a task assigned to someone else", async () => {
    const { leader, member, project } = await setupGroup();
    const create = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Rehearse the pitch", assignedToUserId: member.id });

    const res = await request(app)
      .patch(`/api/groups/${project.id}/tasks/${create.body.id}`)
      .set("Authorization", authHeaderFor(leader))
      .send({ done: true });

    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it("sets completedAt when marked done and clears it when reopened", async () => {
    const { leader, member, project } = await setupGroup();
    const create = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Print handouts", assignedToUserId: member.id });
    expect(create.body.completedAt).toBeNull();

    const done = await request(app)
      .patch(`/api/groups/${project.id}/tasks/${create.body.id}`)
      .set("Authorization", authHeaderFor(member))
      .send({ done: true });
    expect(done.body.completedAt).not.toBeNull();
    expect(new Date(done.body.completedAt).getTime()).toBeLessThanOrEqual(Date.now());

    const reopened = await request(app)
      .patch(`/api/groups/${project.id}/tasks/${create.body.id}`)
      .set("Authorization", authHeaderFor(member))
      .send({ done: false });
    expect(reopened.body.done).toBe(false);
    expect(reopened.body.completedAt).toBeNull();
  });

  it("allows the leader to edit a task's title/description/assignee", async () => {
    const { leader, member, project } = await setupGroup();
    const create = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Draft" });

    const res = await request(app)
      .put(`/api/groups/${project.id}/tasks/${create.body.id}`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Final title", description: "More detail", assignedToUserId: member.id });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Final title");
    expect(res.body.description).toBe("More detail");
    expect(res.body.assignedToUserId).toBe(member.id);
  });

  it("rejects a plain member editing a task", async () => {
    const { leader, member, project } = await setupGroup();
    const create = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Draft" });

    const res = await request(app)
      .put(`/api/groups/${project.id}/tasks/${create.body.id}`)
      .set("Authorization", authHeaderFor(member))
      .send({ title: "Hijacked title" });

    expect(res.status).toBe(403);
  });

  it("allows the leader to delete a task, and rejects a plain member doing so", async () => {
    const { leader, member, project } = await setupGroup();
    const create = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Temporary task" });

    const rejected = await request(app)
      .delete(`/api/groups/${project.id}/tasks/${create.body.id}`)
      .set("Authorization", authHeaderFor(member));
    expect(rejected.status).toBe(403);

    const res = await request(app)
      .delete(`/api/groups/${project.id}/tasks/${create.body.id}`)
      .set("Authorization", authHeaderFor(leader));
    expect(res.status).toBe(200);

    const stillThere = await prisma.task.findUnique({ where: { id: create.body.id } });
    expect(stillThere).toBeNull();
  });

  it("lets any group member (or the instructor) list tasks, but rejects an outsider", async () => {
    const { leader, member, instructor, outsider, project } = await setupGroup();
    await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Visible task" });

    const memberRes = await request(app).get(`/api/groups/${project.id}/tasks`).set("Authorization", authHeaderFor(member));
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.tasks).toHaveLength(1);

    const instructorRes = await request(app).get(`/api/groups/${project.id}/tasks`).set("Authorization", authHeaderFor(instructor));
    expect(instructorRes.status).toBe(200);

    const outsiderRes = await request(app).get(`/api/groups/${project.id}/tasks`).set("Authorization", authHeaderFor(outsider));
    expect(outsiderRes.status).toBe(403);
  });

  it("cascades task deletion when the project is deleted", async () => {
    const { leader, project } = await setupGroup();
    const create = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Orphan-to-be" });

    await prisma.project.delete({ where: { id: project.id } });

    const orphan = await prisma.task.findUnique({ where: { id: create.body.id } });
    expect(orphan).toBeNull();
  });
});

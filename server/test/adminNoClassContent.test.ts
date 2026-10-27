import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

// Admins manage accounts. They never read class content: instructions, attachments, groups, boards.
describe("admin has no access to class content", () => {
  it("is refused on every class, assignment, group and task route; the owner is not", async () => {
    const { user: owner } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: leader } = await createUser({ systemRole: "STUDENT" });
    const cls = await createClassSection(owner.id);
    const asg = await createAssignment(cls.id);
    const project = await createProject({ assignmentId: asg.id });
    await createMembership(leader.id, project.id, "LEADER");

    const paths = [
      `/api/classes/${cls.id}/assignments`,
      `/api/assignments/${asg.id}`,
      `/api/assignments/${asg.id}/attachments`,
      `/api/assignments/${asg.id}/task-summary`,
      `/api/groups/${project.id}`,
      `/api/groups/${project.id}/tasks`,
      `/api/groups/${project.id}/tasks/workload`,
      `/api/groups/${project.id}/document/headings`,
    ];
    for (const path of paths) {
      const asAdmin = await request(app).get(path).set("Authorization", authHeaderFor(admin));
      expect(asAdmin.status, `admin ${path}`).toBe(403);
      const asOwner = await request(app).get(path).set("Authorization", authHeaderFor(owner));
      expect(asOwner.status, `owner ${path}`).toBe(200);
    }
  });
});

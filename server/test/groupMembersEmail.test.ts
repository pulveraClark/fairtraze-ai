import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType: "GITHUB" });
  const project = await createProject({ assignmentId: assignment.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lea Leader", email: "lea@example.test" });
  const { user: member } = await createUser({ systemRole: "STUDENT", name: "Max Member", email: "max@example.test" });
  await prisma.user.update({ where: { id: member.id }, data: { githubUsername: "max-m" } });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  return { instructor, admin, project, leader, member };
}
const get = (u: Parameters<typeof authHeaderFor>[0], id: number) =>
  request(app).get(`/api/groups/${id}`).set("Authorization", authHeaderFor(u));

describe("GET /api/groups/:id - teammates' emails", () => {
  it("students get display names and GitHub usernames but no email, leader included", async () => {
    const { project, leader, member } = await setup();
    for (const viewer of [member, leader]) {
      const res = await get(viewer, project.id);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain("@example.test");
      for (const m of res.body.members) expect(m).not.toHaveProperty("email");
      expect(res.body.members.map((m: { name: string }) => m.name).sort()).toEqual(["Lea Leader", "Max Member"]);
      expect(res.body.members.find((m: { name: string }) => m.name === "Max Member").githubUsername).toBe("max-m");
    }
  });

  it("the owning instructor and an admin still see emails", async () => {
    const { project, instructor, admin } = await setup();
    const asInstructor = await get(instructor, project.id);
    expect(asInstructor.body.members.map((m: { email: string }) => m.email).sort()).toEqual(["lea@example.test", "max@example.test"]);
    const asAdmin = await get(admin, project.id);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.members.map((m: { email: string }) => m.email).sort()).toEqual(["lea@example.test", "max@example.test"]);
  });
});

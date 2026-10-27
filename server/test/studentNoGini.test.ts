import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();
const GINI = 0.31377;

// Every key name found anywhere in a JSON-like body.
function keysOf(node: unknown, out: string[] = []): string[] {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) { out.push(k); keysOf(v, out); }
  }
  return out;
}

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  for (const [u, role] of [[leader, "LEADER"], [member, "MEMBER"]] as const) {
    await createMembership(u.id, project.id, role);
    await prisma.classEnrollment.create({ data: { userId: u.id, classSectionId: cls.id } });
  }
  const report = { members: [], memberCount: 2, gini: GINI, teamHealth: "Healthy" };
  await prisma.report.create({ data: { projectId: project.id, gini: GINI, teamHealth: "Healthy", content: JSON.stringify({ report, narrative: null }) } });
  return { cls, project, leader, member };
}

// The Gini value is the instructor's measure. Students never see it, so the server does not even send it.
describe("student API responses carry no Gini", () => {
  it("the group page, the class list and the class's group list, for a member and for a leader", async () => {
    const s = await setup();
    for (const user of [s.member, s.leader]) {
      const auth = { Authorization: authHeaderFor(user) };
      const paths = ["/api/student/classes", `/api/student/classes/${s.cls.id}/projects`, `/api/student/group/${s.project.id}`];
      for (const path of paths) {
        const res = await request(app).get(path).set(auth);
        expect(res.status, path).toBe(200);
        expect(keysOf(res.body).filter((k) => /gini/i.test(k)), path).toEqual([]);
        expect(JSON.stringify(res.body), path).not.toContain("0.3137");
      }
    }
  });

  it("the instructor's report still has it", async () => {
    const s = await setup();
    const owner = await prisma.user.findUniqueOrThrow({ where: { id: (await prisma.classSection.findUniqueOrThrow({ where: { id: s.cls.id } })).instructorId } });
    const res = await request(app).get(`/api/projects/${s.project.id}/report`).set("Authorization", authHeaderFor(owner));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain("0.3137");
  });
});

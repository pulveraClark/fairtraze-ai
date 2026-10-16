import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

describe("GET /api/privacy/export", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/privacy/export")).status).toBe(401);
  });

  it("contains the caller's own data and nothing of another member's", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cs = await createClassSection(instructor.id);
    const asgn = await createAssignment(cs.id, { sourceType: "COMBINED" });
    const project = await createProject({ assignmentId: asgn.id });

    const { user: me } = await createUser({ systemRole: "STUDENT", name: "Maria Santos", email: "maria@uclm.edu.ph" });
    const { user: other } = await createUser({ systemRole: "STUDENT", name: "Pedro Reyes", email: "pedro@uclm.edu.ph" });
    await prisma.user.update({ where: { id: me.id }, data: { githubUsername: "msantos" } });
    await prisma.user.update({ where: { id: other.id }, data: { githubUsername: "preyes" } });
    await createMembership(me.id, project.id, "LEADER");
    await createMembership(other.id, project.id);

    await prisma.report.create({
      data: {
        projectId: project.id,
        content: JSON.stringify({
          report: {
            memberCount: 2,
            members: [
              { studentName: "Maria Santos", githubUsername: "msantos", userId: me.id, contributionShare: 0.62, flags: [] },
              { studentName: "Pedro Reyes", githubUsername: "preyes", userId: other.id, contributionShare: 0.38, flags: ["free-rider"] },
            ],
          },
          narrative: "Pedro Reyes contributed less.",
        }),
      },
    });
    await prisma.task.create({ data: { projectId: project.id, number: 1, title: "My task", createdByUserId: me.id, assignedToUserId: me.id } });
    await prisma.task.create({ data: { projectId: project.id, number: 2, title: "Pedro private task", createdByUserId: other.id, assignedToUserId: other.id } });
    await prisma.dispute.create({ data: { projectId: project.id, studentUserId: other.id, memberName: "Pedro Reyes", reason: "Pedro dispute text" } });

    const res = await request(app).get("/api/privacy/export").set("Authorization", authHeaderFor(me));
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");

    const body = JSON.parse(res.text);
    expect(body.profile.email).toBe("maria@uclm.edu.ph");
    expect(body.profile.passwordHash).toBeUndefined();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].latestReport.myContribution.contributionShare).toBe(0.62);
    expect(body.tasks.map((t: { title: string }) => t.title)).toEqual(["My task"]);

    const raw = res.text;
    for (const leak of ["Pedro", "preyes", "pedro@uclm.edu.ph", "free-rider", "0.38", "passwordHash"]) {
      expect(raw).not.toContain(leak);
    }
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject } from "./factories.js";

const app = createApp();

describe("project ownership checks", () => {
  it("blocks instructor B from reading instructor A's project report", async () => {
    const { user: instructorA } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: instructorB } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructorA.id);
    const assignment = await createAssignment(classSection.id);
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .get(`/api/projects/${project.id}/report`)
      .set("Authorization", authHeaderFor(instructorB));

    expect(res.status).toBe(403);
  });

  it("blocks instructor B from analyzing instructor A's project", async () => {
    const { user: instructorA } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: instructorB } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructorA.id);
    const assignment = await createAssignment(classSection.id);
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructorB));

    expect(res.status).toBe(403);
  });

  it("blocks instructor B from reconfiguring instructor A's project", async () => {
    const { user: instructorA } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: instructorB } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructorA.id);
    const assignment = await createAssignment(classSection.id);
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .patch(`/api/projects/${project.id}/config`)
      .set("Authorization", authHeaderFor(instructorB))
      .send({
        weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
        thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
        blend: { wGitHub: 0.5, wDocs: 0.5 },
      });

    expect(res.status).toBe(403);
  });

  it("allows the owning instructor to read their own project report", async () => {
    const { user: instructorA } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructorA.id);
    const assignment = await createAssignment(classSection.id);
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .get(`/api/projects/${project.id}/report`)
      .set("Authorization", authHeaderFor(instructorA));

    // No report has been generated yet — the ownership check should pass
    // and the 404 should come from "no report found", not "no access".
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/report/i);
  });

  it("documents the known gap: an assignment-less project is readable by ANY instructor", async () => {
    // TODO in projects.ts explicitly acknowledges this: assignmentId === null
    // projects are not scoped to an owner. This test pins down current
    // behavior so a future fix is a deliberate, visible change, not a
    // silent regression either way.
    const { user: someInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const project = await createProject({ assignmentId: null });

    const res = await request(app)
      .get(`/api/projects/${project.id}/report`)
      .set("Authorization", authHeaderFor(someInstructor));

    // Reaches past the ownership check (403 would mean access was denied);
    // 404 here means "no report found" for an otherwise-accessible project.
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/report/i);
  });

  it("rejects unauthenticated requests to the report endpoint", async () => {
    const project = await createProject({ assignmentId: null });
    const res = await request(app).get(`/api/projects/${project.id}/report`);
    expect(res.status).toBe(401);
  });

  it("rejects a STUDENT-role token from reading a project report", async () => {
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const project = await createProject({ assignmentId: null });

    const res = await request(app)
      .get(`/api/projects/${project.id}/report`)
      .set("Authorization", authHeaderFor(student));

    expect(res.status).toBe(403);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createProject } from "./factories.js";

const app = createApp();

// A group with no assignment has no owning class, so no instructor may see or change it.
describe("projects with no assignment", () => {
  it("are hidden from the project list and summary", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const project = await createProject({ assignmentId: null });

    for (const path of ["/api/projects", "/api/projects/summary"]) {
      const res = await request(app).get(path).set("Authorization", authHeaderFor(instructor));
      expect(res.status).toBe(200);
      const ids = (res.body.projects ?? res.body.summary).map((p: { id: number }) => p.id);
      expect(ids).not.toContain(project.id);
    }
  });

  it("answer 403 to every instructor route that takes a project id", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const project = await createProject({ assignmentId: null });
    const auth = authHeaderFor(instructor);

    expect((await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", auth)).status).toBe(403);
    expect((await request(app).get(`/api/projects/${project.id}/report/history`).set("Authorization", auth)).status).toBe(403);
    expect((await request(app).get(`/api/projects/${project.id}/disputes`).set("Authorization", auth)).status).toBe(403);
    expect((await request(app).post(`/api/projects/${project.id}/analyze`).set("Authorization", auth)).status).toBe(403);
    expect((await request(app).post(`/api/projects/${project.id}/narrative`).set("Authorization", auth)).status).toBe(403);
  });
});

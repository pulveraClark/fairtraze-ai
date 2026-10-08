import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject } from "./factories.js";

const app = createApp();

// EDITOR-sourced assignments don't require a GITHUB_TOKEN or any real document,
// so /analyze can run end-to-end here without mocking GitHub.
async function setupEditorProject() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id });
  return { instructor, project };
}

describe("Report history accumulation", () => {
  it("creates a new Report row on every analyze call instead of overwriting the existing one", async () => {
    const { instructor, project } = await setupEditorProject();

    const first = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(second.status).toBe(200);

    const third = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(third.status).toBe(200);

    const rows = await prisma.report.findMany({ where: { projectId: project.id } });
    expect(rows.length).toBe(3);
  }, 40000); // three sequential real round trips against the test Neon DB; default 20s timeout is tight

  it("carries the previously saved narrative forward onto the new row instead of blanking it", async () => {
    const { instructor, project } = await setupEditorProject();

    const first = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(first.status).toBe(200);
    expect(first.body.narrative).toBeNull();

    // Simulate a previously generated narrative being saved on the first (only) report row,
    // the way POST /narrative does — without invoking the real Gemini call.
    const firstReport = await prisma.report.findFirst({ where: { projectId: project.id } });
    const storedContent = JSON.parse(firstReport!.content!) as { report: unknown; narrative: string | null };
    await prisma.report.update({
      where: { id: firstReport!.id },
      data: { content: JSON.stringify({ ...storedContent, narrative: "This team showed balanced participation." }) },
    });

    const second = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(second.status).toBe(200);
    expect(second.body.narrative).toBe("This team showed balanced participation.");

    // The narrative must be carried onto a NEW row, not written back onto the first one
    // (which would defeat accumulation) — confirm both rows exist and both carry it.
    const rows = await prisma.report.findMany({ where: { projectId: project.id }, orderBy: { generatedAt: "asc" } });
    expect(rows.length).toBe(2);
    const secondContent = JSON.parse(rows[1].content!) as { narrative: string | null };
    expect(secondContent.narrative).toBe("This team showed balanced participation.");
  });

  it("GET /report/history returns all accumulated points, oldest first, and enforces ownership", async () => {
    const { instructor, project } = await setupEditorProject();
    const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });

    await request(app).post(`/api/projects/${project.id}/analyze`).set("Authorization", authHeaderFor(instructor));
    await request(app).post(`/api/projects/${project.id}/analyze`).set("Authorization", authHeaderFor(instructor));

    const res = await request(app)
      .get(`/api/projects/${project.id}/report/history`)
      .set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);
    expect(res.body.history.length).toBe(2);
    expect(new Date(res.body.history[0].generatedAt).getTime())
      .toBeLessThanOrEqual(new Date(res.body.history[1].generatedAt).getTime());

    const forbidden = await request(app)
      .get(`/api/projects/${project.id}/report/history`)
      .set("Authorization", authHeaderFor(otherInstructor));
    expect(forbidden.status).toBe(403);
  });
});

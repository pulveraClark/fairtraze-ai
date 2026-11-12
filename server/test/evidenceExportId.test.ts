import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { authHeaderFor } from "./factories.js";
import { saveReport, setup } from "./helpers/evidenceFixtures.js";

const app = createApp();

// The instructor's printed export shows a Report ID only if a student has already opened the evidence
// report for that analysis. Reading the instructor report must never make one.
describe("GET /api/projects/:id/report - evidenceReportId", () => {
  it("is null when no ID exists, and reading the report does not create one", async () => {
    const { project, instructor } = await setup("GITHUB");
    const report = await saveReport(project.id, "GITHUB");

    const res = await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);
    expect(res.body.evidenceReportId).toBeNull();
    expect(await prisma.reportEvidenceId.count({ where: { reportId: report.id } })).toBe(0);
  });

  it("carries the existing ID of the latest analysis once a member has opened the evidence report", async () => {
    const { project, instructor, member } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    const code = (await request(app).get(`/api/groups/${project.id}/evidence-report`).set("Authorization", authHeaderFor(member))).body.reportId;

    const res = await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(instructor));
    expect(res.body.evidenceReportId).toBe(code);

    // A newer analysis has no ID yet: the export shows none rather than the old one.
    await saveReport(project.id, "GITHUB");
    const next = await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(instructor));
    expect(next.body.evidenceReportId).toBeNull();
  });
});

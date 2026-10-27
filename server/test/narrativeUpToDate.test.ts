import { describe, it, expect, vi, beforeEach } from "vitest";

const { generateContent } = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";
  return { generateContent: vi.fn() };
});
// The shared test setup replaces gemini.js; this test needs the real one (and mocks the provider SDK instead).
vi.unmock("../src/lib/gemini.js");
vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

// Regenerate with nothing changed makes no AI call; a failed or quota-limited attempt never counts as unchanged.
const app = createApp();

const member = (name: string, share: number) => ({
  studentName: name, githubUsername: name.toLowerCase(), commits: 10, additions: 100, deletions: 5, churn: 105, activeDays: 4,
  contributionShare: share, flags: [] as string[],
});
const teamReport = { members: [member("Ana", 0.5), member("Ben", 0.5)], memberCount: 2, gini: 0.05, teamHealth: "Healthy" };

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType: "GITHUB" });
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: "Build a login page." } });
  const project = await createProject({ assignmentId: asg.id });
  const { user: ana } = await createUser({ systemRole: "STUDENT", name: "Ana" });
  await createMembership(ana.id, project.id, "LEADER");
  const report = await prisma.report.create({ data: { projectId: project.id, content: JSON.stringify({ report: teamReport }) } });
  return { instructor, project, report, asg };
}

const post = (id: number, u: unknown, regenerate = true) =>
  request(app).post(`/api/projects/${id}/narrative${regenerate ? "?regenerate=true" : ""}`).set("Authorization", authHeaderFor(u as never));

describe("POST /api/projects/:id/narrative", () => {
  beforeEach(() => { generateContent.mockReset(); generateContent.mockResolvedValue({ text: "Healthy team." }); });

  it("regenerating unchanged data makes no AI call and says since when", async () => {
    const s = await setup();
    const first = await post(s.project.id, s.instructor, false);
    expect(first.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);

    const again = await post(s.project.id, s.instructor);
    expect(again.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(again.body).toMatchObject({ narrative: "Healthy team.", cached: true });
    expect(Date.parse(again.body.upToDate.since)).toBeLessThanOrEqual(Date.now());
  });

  it("a changed instruction text makes a new call", async () => {
    const s = await setup();
    await post(s.project.id, s.instructor, false);
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: "Build a login page and a signup page." } });
    const res = await post(s.project.id, s.instructor);
    expect(res.body.cached).toBe(false);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("a narrative the results have moved past (narrativeOutdated), or one saved without a fingerprint, is regenerated", async () => {
    const s = await setup();
    await post(s.project.id, s.instructor, false);
    const row = await prisma.report.findUniqueOrThrow({ where: { id: s.report.id } });
    await prisma.report.update({ where: { id: s.report.id }, data: { content: JSON.stringify({ ...JSON.parse(row.content!), narrativeOutdated: true }) } });
    await post(s.project.id, s.instructor);
    expect(generateContent).toHaveBeenCalledTimes(2);

    const { narrativeInputHash: _h, narrativeAt: _a, ...legacy } = JSON.parse((await prisma.report.findUniqueOrThrow({ where: { id: s.report.id } })).content!);
    await prisma.report.update({ where: { id: s.report.id }, data: { content: JSON.stringify(legacy) } });
    await post(s.project.id, s.instructor);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });
});

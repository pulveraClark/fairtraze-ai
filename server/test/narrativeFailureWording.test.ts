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
import { NARRATIVE_UNAVAILABLE_TEXT, NARRATIVE_KEPT_TEXT } from "../src/lib/aiFailureText.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

// When the AI explanation cannot be written, the instructor gets plain words with a next step (never the
// provider's text), and the scores and flags are untouched.
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
  const project = await createProject({ assignmentId: asg.id });
  const { user: ana } = await createUser({ systemRole: "STUDENT", name: "Ana" });
  await createMembership(ana.id, project.id, "LEADER");
  const report = await prisma.report.create({ data: { projectId: project.id, content: JSON.stringify({ report: teamReport }) } });
  return { instructor, project, report };
}

const post = (id: number, u: unknown, regenerate = true) =>
  request(app).post(`/api/projects/${id}/narrative${regenerate ? "?regenerate=true" : ""}`).set("Authorization", authHeaderFor(u as never));

describe("narrative failure wording", () => {
  beforeEach(() => { generateContent.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("with nothing saved, a failure says the explanation is unavailable, that scores are unaffected, and to try later", async () => {
    const s = await setup();
    generateContent.mockRejectedValue(new Error("provider exploded: key=secret"));
    const res = await post(s.project.id, s.instructor, false);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(NARRATIVE_UNAVAILABLE_TEXT);
    expect(JSON.stringify(res.body)).not.toMatch(/secret|exploded/);
  });

  it("with a saved explanation, a failure keeps it and says why in a warning that names the next step", async () => {
    const s = await setup();
    generateContent.mockResolvedValueOnce({ text: "Healthy team." });
    expect((await post(s.project.id, s.instructor, false)).status).toBe(200);

    const row = await prisma.report.findUniqueOrThrow({ where: { id: s.report.id } });
    await prisma.report.update({ where: { id: s.report.id }, data: { content: JSON.stringify({ ...JSON.parse(row.content!), narrativeOutdated: true }) } });
    generateContent.mockRejectedValue(new Error("provider exploded: key=secret"));

    const res = await post(s.project.id, s.instructor);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ narrative: "Healthy team.", cached: true, warning: NARRATIVE_KEPT_TEXT });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|exploded/);
  });
});

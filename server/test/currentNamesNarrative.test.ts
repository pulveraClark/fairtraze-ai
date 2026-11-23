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
import { narrativeInputHash } from "../src/lib/gemini.js";
import { runAnalysis, silentProgress } from "../src/lib/analysisRunner.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const asg = await createAssignment(cs.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id, repoUrl: null, groupName: "Group Names" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Christian Lenizo" });
  const { user: ben } = await createUser({ systemRole: "STUDENT", name: "Benedict Cruz" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(ben.id, project.id, "MEMBER");
  const analyze = (trigger: "auto" | "manual") => runAnalysis(project.id, { progress: silentProgress, actorInstructorId: null, trigger });
  expect((await analyze("manual")).status).toBe(200);
  return { instructor, project, leader, ben, analyze };
}

const generate = (id: number, u: unknown, regenerate = false) =>
  request(app).post(`/api/projects/${id}/narrative${regenerate ? "?regenerate=true" : ""}`).set("Authorization", authHeaderFor(u as never));
const getReport = (id: number, u: unknown) =>
  request(app).get(`/api/projects/${id}/report`).set("Authorization", authHeaderFor(u as never));
const rename = (id: number, name: string) => prisma.user.update({ where: { id }, data: { name } });

describe("current names and the AI explanation", () => {
  beforeEach(() => {
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: "Member A and Member B both worked on the document." });
  });

  it("the Gemini prompt holds only pseudonyms: no real name or username leaves the server", async () => {
    const s = await setup();
    await rename(s.leader.id, "Christian Gwapo");
    await prisma.user.update({ where: { id: s.leader.id }, data: { githubUsername: "secret-gh-login" } });
    expect((await generate(s.project.id, s.instructor)).status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(generateContent.mock.calls[0]);
    expect(sent).toContain("Member A");
    for (const real of ["Christian", "Lenizo", "Gwapo", "Benedict", "Cruz", "secret-gh-login"]) expect(sent).not.toContain(real);
  });

  it("narrativeInputHash is the same before and after a rename", async () => {
    const s = await setup();
    const row = await prisma.report.findFirstOrThrow({ where: { projectId: s.project.id }, orderBy: { id: "desc" } });
    const stored = JSON.parse(row.content!) as { report: { members: Array<{ studentName: string }> } };
    const before = narrativeInputHash("Group Names", stored.report as never, "brief");
    const renamed = { ...stored.report, members: stored.report.members.map((m, i) => (i === 0 ? { ...m, studentName: "Somebody Else" } : m)) };
    expect(narrativeInputHash("Group Names", renamed as never, "brief")).toBe(before);
  });

  it("'Already up to date' after a rename answers without an AI call and shows the new name", async () => {
    const s = await setup();
    expect((await generate(s.project.id, s.instructor)).status).toBe(200);
    await rename(s.leader.id, "Christian Gwapo");
    const again = await generate(s.project.id, s.instructor, true);
    expect(again.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(again.body.upToDate).toBeTruthy();
    expect(again.body.narrative).toContain("Christian Gwapo");
    expect(again.body.narrative).not.toContain("Christian Lenizo");
    expect(JSON.stringify(again.body)).not.toContain("narrativeNames");
    // Saved text is untouched: the stored row still has the name it was written with.
    const row = await prisma.report.findFirstOrThrow({ where: { projectId: s.project.id }, orderBy: { id: "desc" } });
    expect(row.content).toContain("Christian Lenizo");
  });

  it("rename, then re-analysis: the carried-forward text still shows the new name (once)", async () => {
    const s = await setup();
    expect((await generate(s.project.id, s.instructor)).status).toBe(200);
    await rename(s.leader.id, "Christian Gwapo");
    expect((await s.analyze("auto")).status).toBe(200);

    // The new report snapshot has the new name; the carried text still holds the old one.
    const row = await prisma.report.findFirstOrThrow({ where: { projectId: s.project.id }, orderBy: { id: "desc" } });
    const content = JSON.parse(row.content!) as { report: { members: Array<{ studentName: string }> }; narrative: string; narrativeNames?: unknown };
    expect(content.report.members.map((m) => m.studentName)).toContain("Christian Gwapo");
    expect(content.narrative).toContain("Christian Lenizo");
    expect(content.narrativeNames).toBeTruthy();

    const res = await getReport(s.project.id, s.instructor);
    expect(res.body.narrative).toContain("Christian Gwapo");
    expect(res.body.narrative).not.toContain("Christian Lenizo");
    expect(res.body.narrative).not.toContain("Gwapo Gwapo");
    expect(JSON.stringify(res.body)).not.toContain("narrativeNames");
  });

  it("legacy narrative with no narrativeNames, rename, re-analysis: the row it was written on gives the old name", async () => {
    const s = await setup();
    expect((await generate(s.project.id, s.instructor)).status).toBe(200);
    // Make the saved text look like one written before narrativeNames existed.
    const first = await prisma.report.findFirstOrThrow({ where: { projectId: s.project.id }, orderBy: { id: "desc" } });
    const { narrativeNames: _n, ...legacy } = JSON.parse(first.content!);
    await prisma.report.update({ where: { id: first.id }, data: { content: JSON.stringify(legacy) } });
    await rename(s.leader.id, "Christian Gwapo");
    expect((await s.analyze("auto")).status).toBe(200);

    const res = await getReport(s.project.id, s.instructor);
    expect(res.body.narrative).toContain("Christian Gwapo");
    expect(res.body.narrative).not.toContain("Christian Lenizo");
  });
});

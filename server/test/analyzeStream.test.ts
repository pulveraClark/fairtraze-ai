import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { fetchRepoStats } from "../src/lib/github.js";
import type { GitHubContributorData, GitHubProgress } from "../src/lib/github.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const app = createApp();

// test/setupEnv.ts mocks ../src/lib/github.js globally, so fetchRepoStats is a vi.fn here.
const mockedFetchRepoStats = vi.mocked(fetchRepoStats);

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSse(text: string): SseEvent[] {
  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter((frame) => frame && !frame.startsWith(":"))
    .map((frame) => {
      const event = /^event: (.*)$/m.exec(frame)?.[1] ?? "";
      const data = JSON.parse(/^data: (.*)$/m.exec(frame)?.[1] ?? "{}") as Record<string, unknown>;
      return { event, data };
    });
}

// Streams the analyze call and returns the raw response plus its parsed events.
async function analyzeStream(projectId: number, instructor: Parameters<typeof authHeaderFor>[0]) {
  const res = await request(app)
    .post(`/api/projects/${projectId}/analyze`)
    .set("Authorization", authHeaderFor(instructor))
    .set("Accept", "text/event-stream")
    .buffer(true)
    .parse((r, cb) => {
      let data = "";
      r.setEncoding("utf8");
      r.on("data", (chunk: string) => { data += chunk; });
      r.on("end", () => cb(null, data));
    });
  return { res, events: parseSse(res.body as string) };
}

function contributor(login: string, commits: number): GitHubContributorData {
  return {
    githubUsername: login,
    commits,
    additions: commits * 10,
    deletions: commits * 2,
    commitDates: Array.from({ length: commits }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
    codeLinesAdded: commits * 10,
    commentLinesAdded: 0,
    blankLinesAdded: 0,
    weightedAdditions: commits * 10,
    selfChurnRatio: 0,
    commitImpactBreakdown: { structural: 0, functional: commits, cosmetic: 0, trivial: 0 },
    fileTypeBreakdown: { source: commits * 10, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    filesChanged: commits,
  };
}

// fetchRepoStats stand-in that reports progress the way the real one does, then resolves.
function githubReturning(contributors: GitHubContributorData[]) {
  return async (_url: string, _token: string, _logins?: string[], onProgress?: (p: GitHubProgress) => void) => {
    onProgress?.({ contributors: 1, commits: contributors[0]?.commits ?? 0, files: contributors[0]?.filesChanged ?? 0 });
    return { contributors };
  };
}

async function setupProject(sourceType: "GITHUB" | "EDITOR" | "COMBINED") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: a } = await createUser({ systemRole: "STUDENT", name: "Member A" });
  const { user: b } = await createUser({ systemRole: "STUDENT", name: "Member B" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(a.id, project.id, "LEADER");
  await createMembership(b.id, project.id, "MEMBER");
  await prisma.member.createMany({
    data: [
      { projectId: project.id, studentName: "Member A", githubUsername: "member-a" },
      { projectId: project.id, studentName: "Member B", githubUsername: "member-b" },
    ],
  });
  return { instructor, a, b, project };
}

async function seedEditorActivity(projectId: number, userId: number) {
  const document = await prisma.document.create({ data: { groupId: projectId } });
  await prisma.editEvent.create({
    data: { documentId: document.id, userId, eventType: "INSERT", position: 0, length: 20, editType: "SUBSTANTIVE", insertedText: "some real paragraph." },
  });
  await prisma.editSession.create({
    data: { documentId: document.id, userId, startedAt: new Date(Date.now() - 60_000), endedAt: new Date(), characterCount: 20 },
  });
  return document;
}

// Any key/value that looks like scoring output. None of this may appear before `done`.
const SCORE_WORDS = /share|flag|gini|health|report|score|contribution|inactive|free-rider|overload/i;
const ALLOWED_KEYS: Record<string, string[]> = {
  github: ["contributors", "commits", "files"],
  docs: ["sessions", "characters"],
  compute: [],
  save: [],
};

function assertNoScoresBeforeDone(events: SseEvent[]) {
  const doneIdx = events.findIndex((e) => e.event === "done");
  expect(doneIdx).toBeGreaterThan(-1);
  for (const e of events.slice(0, doneIdx)) {
    expect(Object.keys(ALLOWED_KEYS)).toContain(e.event);
    expect(JSON.stringify(e)).not.toMatch(SCORE_WORDS);
    expect(Object.keys(e.data).sort()).toEqual([...ALLOWED_KEYS[e.event]].sort());
    for (const v of Object.values(e.data)) expect(typeof v).toBe("number");
  }
}

function stageOrder(events: SseEvent[]) {
  return events.map((e) => e.event).filter((name, i, all) => all.indexOf(name) === i);
}

afterEach(() => {
  mockedFetchRepoStats.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/projects/:id/analyze — progress stream", () => {
  it("GITHUB: emits github → compute → save → done, with counts only before done", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const { instructor, project } = await setupProject("GITHUB");
    mockedFetchRepoStats.mockImplementationOnce(githubReturning([contributor("member-a", 3), contributor("member-b", 1)]));

    const { res, events } = await analyzeStream(project.id, instructor);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    expect(res.headers["cache-control"]).toMatch(/no-transform/);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(stageOrder(events)).toEqual(["github", "compute", "save", "done"]);
    expect(events.find((e) => e.event === "github" && (e.data.commits as number) > 0)?.data).toEqual({ contributors: 1, commits: 3, files: 3 });
    assertNoScoresBeforeDone(events);
    expect(events[events.length - 1].event).toBe("done");
  });

  it("EDITOR: emits docs → compute → save → done, with the seeded session/character counts", async () => {
    const { instructor, a, project } = await setupProject("EDITOR");
    await seedEditorActivity(project.id, a.id);

    const { events } = await analyzeStream(project.id, instructor);

    expect(stageOrder(events)).toEqual(["docs", "compute", "save", "done"]);
    expect(events.find((e) => e.event === "docs")?.data).toEqual({ sessions: 1, characters: 20 });
    assertNoScoresBeforeDone(events);
  });

  it("COMBINED: both source rows report before compute", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const { instructor, a, project } = await setupProject("COMBINED");
    await seedEditorActivity(project.id, a.id);
    mockedFetchRepoStats.mockImplementationOnce(githubReturning([contributor("member-a", 2)]));

    const { events } = await analyzeStream(project.id, instructor);

    const names = events.map((e) => e.event);
    expect(names.indexOf("github")).toBeGreaterThan(-1);
    expect(names.indexOf("docs")).toBeGreaterThan(-1);
    expect(names.lastIndexOf("github")).toBeLessThan(names.indexOf("compute"));
    expect(names.indexOf("docs")).toBeLessThan(names.indexOf("compute"));
    expect(stageOrder(events).slice(-3)).toEqual(["compute", "save", "done"]);
    assertNoScoresBeforeDone(events);
  });

  it("the done payload equals the plain JSON response for the same project", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const { instructor, project } = await setupProject("GITHUB");
    const contributors = [contributor("member-a", 3), contributor("member-b", 1)];
    mockedFetchRepoStats.mockImplementation(githubReturning(contributors));

    const { events } = await analyzeStream(project.id, instructor);
    const plain = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));

    expect(plain.status).toBe(200);
    expect(plain.headers["content-type"]).toMatch(/application\/json/);
    const done = events.find((e) => e.event === "done")!.data;
    expect({ ...done, analyzedAt: undefined }).toEqual({ ...plain.body, analyzedAt: undefined });
  });

  it("a GitHub 404 is an error event when streaming and HTTP 404 JSON otherwise", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const { instructor, project } = await setupProject("GITHUB");
    mockedFetchRepoStats.mockRejectedValue(Object.assign(new Error("Not Found"), { status: 404 }));

    const { events } = await analyzeStream(project.id, instructor);
    const err = events[events.length - 1];
    expect(err.event).toBe("error");
    expect(err.data).toMatchObject({ status: 404, error: "GitHub repo not found or token lacks access" });

    const plain = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));
    expect(plain.status).toBe(404);
    expect(plain.body).toMatchObject({ error: "GitHub repo not found or token lacks access" });
  });

  it("validation errors before the stream opens stay plain JSON, even with Accept: text/event-stream", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const res = await request(app)
      .post(`/api/projects/999999/analyze`)
      .set("Authorization", authHeaderFor(instructor))
      .set("Accept", "text/event-stream");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

// COMBINED now runs GitHub and editor collection concurrently. A failure in either must surface
// exactly as it did when they ran one after the other.
describe("COMBINED failure parity with the previous sequential order", () => {
  it("an editor-stats failure (GitHub fine) responds 500 { error: <message> } like any uncaught route error", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const { instructor, a, project } = await setupProject("COMBINED");
    await seedEditorActivity(project.id, a.id);
    mockedFetchRepoStats.mockImplementationOnce(githubReturning([contributor("member-a", 2)]));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.editSession, "findMany").mockRejectedValue(new Error("docs db down"));

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "docs db down" });
    expect(await prisma.report.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("when both fail, the GitHub error wins (it was checked first when sequential)", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const { instructor, a, project } = await setupProject("COMBINED");
    await seedEditorActivity(project.id, a.id);
    mockedFetchRepoStats.mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.editSession, "findMany").mockRejectedValue(new Error("docs db down"));

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "GitHub rate limit exceeded" });
  });
});

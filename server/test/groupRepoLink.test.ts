import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { checkRepoReachable } from "../src/lib/githubRepoCheck.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();
const reach = vi.mocked(checkRepoReachable);

async function setup(opts: { sourceType?: "GITHUB" | "COMBINED" | "EDITOR"; repoUrl?: string | null } = {}) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: opts.sourceType ?? "GITHUB" });
  const project = await createProject({ assignmentId: assignment.id, repoUrl: opts.repoUrl ?? null });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  return { instructor, project, leader, member, outsider };
}

const put = (u: Parameters<typeof authHeaderFor>[0], id: number, repoUrl: string) =>
  request(app).put(`/api/groups/${id}/repo`).set("Authorization", authHeaderFor(u)).send({ repoUrl });

beforeEach(() => {
  reach.mockReset();
  reach.mockResolvedValue({ status: "ok" });
});

describe("PUT /api/groups/:id/repo - who may link or change", () => {
  it("any member can add the FIRST link", async () => {
    const { project, member } = await setup();
    const res = await put(member, project.id, "github.com/acme/app");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repoUrl: "https://github.com/acme/app", changed: true });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).repoUrl).toBe("https://github.com/acme/app");
  });

  it("once linked, a plain member cannot change it", async () => {
    const { project, member } = await setup({ repoUrl: "https://github.com/acme/app" });
    const res = await put(member, project.id, "https://github.com/acme/other");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Only the group leader/);
    expect(reach).not.toHaveBeenCalled();
  });

  it("once linked, the leader can change it", async () => {
    const { project, leader } = await setup({ repoUrl: "https://github.com/acme/app" });
    const res = await put(leader, project.id, "https://github.com/acme/other");
    expect(res.status).toBe(200);
    expect(res.body.repoUrl).toBe("https://github.com/acme/other");
  });

  it("the instructor and people outside the group get 403", async () => {
    const { project, instructor, outsider } = await setup();
    expect((await put(instructor, project.id, "https://github.com/acme/app")).status).toBe(403);
    expect((await put(outsider, project.id, "https://github.com/acme/app")).status).toBe(403);
  });

  it("a Docs-only project never takes a repository", async () => {
    const { project, leader } = await setup({ sourceType: "EDITOR" });
    const res = await put(leader, project.id, "https://github.com/acme/app");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/FairTraze Docs only/);
  });

  it("saving the same repository again changes nothing and logs nothing", async () => {
    const { project, leader } = await setup({ repoUrl: "https://github.com/acme/app" });
    const res = await put(leader, project.id, "https://github.com/Acme/App.git");
    expect(res.body.changed).toBe(false);
    expect(await prisma.auditLog.count()).toBe(0);
    expect(reach).not.toHaveBeenCalled();
  });
});

describe("PUT /api/groups/:id/repo - validation messages", () => {
  it.each([
    ["", /Paste the link/],
    ["https://gitlab.com/acme/app", /not a GitHub link/],
    ["https://github.com/acme", /Add the repository name/],
    ["https://github.com/acme/app/issues", /Remove everything after/],
  ])("format %j gives 400 REPO_FORMAT", async (value, message) => {
    const { project, leader } = await setup();
    const res = await put(leader, project.id, value);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("REPO_FORMAT");
    expect(res.body.error).toMatch(message);
    expect(reach).not.toHaveBeenCalled();
  });

  it("a missing or private repository ends with one clear action", async () => {
    reach.mockResolvedValue({ status: "not-found" });
    const { project, leader } = await setup();
    const res = await put(leader, project.id, "https://github.com/acme/nope");
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("REPO_NOT_FOUND");
    expect(res.body.error).toMatch(/Make the repository public, or ask your instructor how to share it\.$/);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).repoUrl).toBeNull();
  });

  it.each([
    ["rate-limited", 429, "REPO_CHECK_BUSY"],
    ["no-token", 503, "REPO_CHECK_UNAVAILABLE"],
    ["unreachable", 502, "REPO_CHECK_FAILED"],
  ] as const)("GitHub check %s gives %i %s and nothing is saved", async (status, http, code) => {
    reach.mockResolvedValue({ status });
    const { project, leader } = await setup();
    const res = await put(leader, project.id, "https://github.com/acme/app");
    expect(res.status).toBe(http);
    expect(res.body.code).toBe(code);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).repoUrl).toBeNull();
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe("PUT /api/groups/:id/repo - audit log and notifications", () => {
  it("first link: GROUP_REPO_LINKED audit row, alert to the other members, none to the instructor", async () => {
    const { project, member, leader, instructor } = await setup();
    await put(member, project.id, "https://github.com/acme/app");
    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log).toMatchObject({ action: "GROUP_REPO_LINKED", targetType: "GROUP", targetId: String(project.id), actorId: member.id });
    expect(log.details).toBe("https://github.com/acme/app");
    const alerts = await prisma.alert.findMany({ where: { type: "GROUP_REPO_CHANGED" } });
    expect(alerts.map((a) => a.recipientId)).toEqual([leader.id]);
    expect(alerts.some((a) => a.recipientId === instructor.id)).toBe(false);
  });

  it("change: GROUP_REPO_CHANGED audit row with old and new, alerts to members and the instructor", async () => {
    const { project, leader, member, instructor } = await setup({ repoUrl: "https://github.com/acme/app" });
    await put(leader, project.id, "https://github.com/acme/other");
    const log = await prisma.auditLog.findFirstOrThrow();
    expect(log.action).toBe("GROUP_REPO_CHANGED");
    expect(log.details).toBe("https://github.com/acme/app -> https://github.com/acme/other");
    const alerts = await prisma.alert.findMany({ where: { type: "GROUP_REPO_CHANGED" } });
    expect(alerts.map((a) => a.recipientId).sort()).toEqual([member.id, instructor.id].sort());
    expect(alerts.find((a) => a.recipientId === instructor.id)!.link).toBe(`/project/${project.id}`);
  });
});

describe("a changed repository marks the latest report outdated", () => {
  async function withReport(repoUrl: string) {
    const ctx = await setup({ repoUrl });
    await prisma.report.create({
      data: { projectId: ctx.project.id, gini: 0.1, teamHealth: "Healthy", content: JSON.stringify({ report: { members: [] } }) },
    });
    return ctx;
  }

  it("sets the stale marker and repoChanged on the instructor summary", async () => {
    const { project, leader, instructor } = await withReport("https://github.com/acme/app");
    await put(leader, project.id, "https://github.com/acme/other");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).membershipChangedAt).not.toBeNull();
    const res = await request(app).get("/api/projects/summary").set("Authorization", authHeaderFor(instructor));
    const item = res.body.summary.find((s: { projectId: number }) => s.projectId === project.id);
    expect(item.repoChanged).toBe(true);
    expect(item.hasRepo).toBe(true);
  });

  it("clears once the group is analyzed again (a newer report)", async () => {
    const { project, leader, instructor } = await withReport("https://github.com/acme/app");
    await put(leader, project.id, "https://github.com/acme/other");
    await prisma.report.create({
      data: {
        projectId: project.id, gini: 0.1, teamHealth: "Healthy",
        content: JSON.stringify({ report: { members: [] } }), generatedAt: new Date(Date.now() + 60_000),
      },
    });
    const res = await request(app).get("/api/projects/summary").set("Authorization", authHeaderFor(instructor));
    expect(res.body.summary.find((s: { projectId: number }) => s.projectId === project.id).repoChanged).toBe(false);
  });

  it("the first link (no previous repository) does not mark anything outdated", async () => {
    const { project, member } = await setup();
    await put(member, project.id, "https://github.com/acme/app");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).membershipChangedAt).toBeNull();
  });
});

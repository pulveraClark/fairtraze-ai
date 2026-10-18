import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import type { BoardResponse, TaskDetails } from "@shared/taskTypes.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "../../test/factories.js";
import { prisma } from "../lib/prisma.js";
import { createApp } from "../app.js";
import { fetchRepoCommitMessages, type RepoCommit } from "../lib/githubCommitMessages.js";
import { linkCommitsBestEffort, linkCommitsToTasks } from "../lib/taskCommitLinks.js";

// Phase 5: commit linking and task keys. The GitHub reader is mocked globally (test/setupEnv.ts); each
// test says what the repo "contains". Nothing here reaches GitHub.

const app = createApp();
const fetcher = vi.mocked(fetchRepoCommitMessages);

type U = Awaited<ReturnType<typeof createUser>>["user"];
const as = (u: U) => authHeaderFor(u);

const commit = (sha: string, message: string, authorLogin: string | null = "ana-dev", committedAt = "2026-10-10T02:00:00.000Z"): RepoCommit =>
  ({ sha, message, authorLogin, committedAt });

beforeEach(() => {
  process.env.GITHUB_TOKEN = "test-token";
  fetcher.mockReset();
  fetcher.mockResolvedValue([]);
});

async function setup(opts: { sourceType?: "GITHUB" | "COMBINED" | "EDITOR"; repoUrl?: string; taskKey?: string | null; tasks?: number } = {}) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const assignment = await createAssignment(cls.id, { sourceType: opts.sourceType ?? "GITHUB" });
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group Alpha" });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  const n = opts.tasks ?? 3;
  await prisma.project.update({
    where: { id: project.id },
    data: {
      repoUrl: opts.repoUrl ?? "https://github.com/Acme/App",
      taskKey: opts.taskKey === undefined ? "FT" : opts.taskKey,
      nextTaskNumber: n + 1,
    },
  });
  const tasks = [];
  for (let i = 1; i <= n; i++) {
    tasks.push(await prisma.task.create({
      data: { projectId: project.id, number: i, title: `Task ${i}`, createdByUserId: leader.id, position: i * 1024 },
    }));
  }
  return { instructor, leader, member, project, tasks };
}

const sync = (u: U, projectId: number) => request(app).post(`/api/groups/${projectId}/tasks/sync-commits`).set("Authorization", as(u));
const board = async (u: U, projectId: number) => (await request(app).get(`/api/groups/${projectId}/tasks`).set("Authorization", as(u))).body as BoardResponse;
const details = async (u: U, projectId: number, taskId: number) =>
  (await request(app).get(`/api/groups/${projectId}/tasks/${taskId}/details`).set("Authorization", as(u))).body as TaskDetails;

const REPO_COMMITS = [
  commit("a41f9c2d0000000000000000000000000000aaaa", "FT-1: add the login form\n\nlong body"),
  commit("b52e0d3e0000000000000000000000000000bbbb", "fix ft-2 and FT-1 typo", "ben-dev"),
  commit("c63f1e4f0000000000000000000000000000cccc", "XFT-3 is not ours"),
  commit("d740f2500000000000000000000000000000dddd", "FT-99 does not exist"),
  commit("e851a3610000000000000000000000000000eeee", "FT-3abc glued"),
];

describe("POST /tasks/sync-commits (leader Refresh)", () => {
  it("links commits by task key to existing tasks only, with the first line, and reports the counts", async () => {
    const { leader, project, tasks } = await setup();
    fetcher.mockResolvedValue(REPO_COMMITS);
    const res = await sync(leader, project.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ linked: 3, matched: 2, scanned: 5 });
    expect(fetcher).toHaveBeenCalledWith("Acme", "App", "test-token");

    const links = await prisma.taskCommitLink.findMany({ orderBy: [{ taskId: "asc" }, { sha: "asc" }] });
    expect(links.map((l) => [l.taskId, l.sha.slice(0, 7)])).toEqual([
      [tasks[0]!.id, "a41f9c2"], [tasks[0]!.id, "b52e0d3"], [tasks[1]!.id, "b52e0d3"],
    ]);
    expect(links[0]).toMatchObject({ message: "FT-1: add the login form", repo: "acme/app", authorLogin: "ana-dev" });
  });

  it("is idempotent: a second run links nothing new and adds no History", async () => {
    const { leader, project } = await setup();
    fetcher.mockResolvedValue(REPO_COMMITS);
    await sync(leader, project.id);
    const historyBefore = await prisma.taskActivity.count({ where: { type: "commit_linked" } });
    expect(historyBefore).toBe(3);

    await prisma.project.update({ where: { id: project.id }, data: { commitsRefreshedAt: null } });
    const again = await sync(leader, project.id);
    expect(again.body).toMatchObject({ linked: 0, matched: 2 });
    expect(await prisma.taskCommitLink.count()).toBe(3);
    expect(await prisma.taskActivity.count({ where: { type: "commit_linked" } })).toBe(3);
  });

  it("links a later commit on a second run and leaves earlier links alone", async () => {
    const { leader, project } = await setup();
    fetcher.mockResolvedValue([REPO_COMMITS[0]!]);
    await sync(leader, project.id);
    await prisma.project.update({ where: { id: project.id }, data: { commitsRefreshedAt: null } });
    fetcher.mockResolvedValue([commit("f962b4720000000000000000000000000000ffff", "wire up FT-1 again"), REPO_COMMITS[0]!]);
    const res = await sync(leader, project.id);
    expect(res.body).toMatchObject({ linked: 1, matched: 2 });
    expect(await prisma.taskCommitLink.count()).toBe(2);
  });

  it("allows only one refresh per 5 minutes per group: 429 with the time left, and no second GitHub read", async () => {
    const { leader, project } = await setup();
    fetcher.mockResolvedValue(REPO_COMMITS);
    expect((await sync(leader, project.id)).status).toBe(200);
    const blocked = await sync(leader, project.id);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Try again in \d+ (minutes?|seconds?)/);
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.body.retryAfterSeconds).toBeLessThanOrEqual(300);
    expect(blocked.headers["retry-after"]).toBe(String(blocked.body.retryAfterSeconds));
    expect(fetcher).toHaveBeenCalledTimes(1);

    // After 5 minutes it works again.
    await prisma.project.update({ where: { id: project.id }, data: { commitsRefreshedAt: new Date(Date.now() - 301_000) } });
    expect((await sync(leader, project.id)).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("two clicks at once run the read only once", async () => {
    const { leader, project } = await setup();
    fetcher.mockResolvedValue(REPO_COMMITS);
    const [a, b] = await Promise.all([sync(leader, project.id), sync(leader, project.id)]);
    expect([a.status, b.status].sort()).toEqual([200, 429]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("a failed read does not use up the cooldown, and says why", async () => {
    const { leader, project } = await setup();
    fetcher.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));
    const failed = await sync(leader, project.id);
    expect(failed.status).toBe(404);
    expect(failed.body.error).toMatch(/not found or token lacks access/i);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).commitsRefreshedAt).toBeNull();

    fetcher.mockRejectedValueOnce(new Error("boom"));
    expect((await sync(leader, project.id)).status).toBe(502);
    fetcher.mockResolvedValue(REPO_COMMITS);
    expect((await sync(leader, project.id)).status).toBe(200);
  });

  it("is leader only: members, the instructor and outsiders are refused", async () => {
    const { leader, member, instructor, project } = await setup();
    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    expect((await sync(member, project.id)).status).toBe(403);
    expect((await sync(instructor, project.id)).status).toBe(403);
    expect((await sync(outsider, project.id)).status).toBe(403);
    expect((await request(app).post(`/api/groups/${project.id}/tasks/sync-commits`)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await sync(leader, project.id)).status).toBe(200);
  });

  it("needs a GitHub repo: an editor-only group or a group with no repo gets 400", async () => {
    const editor = await setup({ sourceType: "EDITOR" });
    expect((await sync(editor.leader, editor.project.id)).status).toBe(400);
    const none = await setup({ repoUrl: "" });
    expect((await sync(none.leader, none.project.id)).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates no Report, Alert, score or analysis data and never marks a report outdated", async () => {
    const { leader, project } = await setup();
    const stamp = new Date("2026-09-01T00:00:00Z");
    await prisma.project.update({ where: { id: project.id }, data: { membershipChangedAt: stamp, scoringConfigChangedAt: stamp } });
    fetcher.mockResolvedValue(REPO_COMMITS);
    expect((await sync(leader, project.id)).status).toBe(200);

    const after = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(after.membershipChangedAt?.getTime()).toBe(stamp.getTime());
    expect(after.scoringConfigChangedAt?.getTime()).toBe(stamp.getTime());
    expect(after.commitsRefreshedAt).not.toBeNull();
    expect(await prisma.report.count()).toBe(0);
    expect(await prisma.alert.count()).toBe(0);
    expect(await prisma.cachedCommitDiff.count()).toBe(0);
    expect(await prisma.editEvent.count()).toBe(0);
  });
});

describe("what the board and the details window show", () => {
  it("the board has the commit count per task, the repo flag and the refresh time", async () => {
    const { leader, member, project, tasks } = await setup();
    fetcher.mockResolvedValue(REPO_COMMITS);
    await sync(leader, project.id);
    const b = await board(member, project.id);
    expect(b.group).toMatchObject({ hasRepo: true, keyAliases: [] });
    expect(b.group.commitsRefreshedAt).not.toBeNull();
    const count = (id: number) => b.tasks.find((t) => t.id === id)!.commitCount;
    expect([count(tasks[0]!.id), count(tasks[1]!.id), count(tasks[2]!.id)]).toEqual([2, 1, 0]);
  });

  it("hasRepo is false for an editor-only group and for a group without a repo", async () => {
    const editor = await setup({ sourceType: "EDITOR" });
    expect((await board(editor.leader, editor.project.id)).group.hasRepo).toBe(false);
    const none = await setup({ repoUrl: "" });
    expect((await board(none.leader, none.project.id)).group.hasRepo).toBe(false);
  });

  it("the details list the linked commits newest first with a GitHub link, and History says it was linked", async () => {
    const { leader, instructor, project, tasks } = await setup();
    fetcher.mockResolvedValue([
      commit("a41f9c2d0000000000000000000000000000aaaa", "FT-1 first", "ana-dev", "2026-10-09T02:00:00.000Z"),
      commit("b52e0d3e0000000000000000000000000000bbbb", "FT-1 second", null, "2026-10-11T02:00:00.000Z"),
    ]);
    await sync(leader, project.id);
    for (const viewer of [leader, instructor]) {
      const d = await details(viewer, project.id, tasks[0]!.id);
      expect(d.commits.map((c) => c.message)).toEqual(["FT-1 second", "FT-1 first"]);
      expect(d.commits[0]).toMatchObject({
        shortSha: "b52e0d3", authorLogin: null,
        url: "https://github.com/acme/app/commit/b52e0d3e0000000000000000000000000000bbbb",
      });
      expect(d.activity.filter((a) => a.type === "commit_linked")).toHaveLength(2);
      expect(d.activity[0]).toMatchObject({ type: "commit_linked", actorId: null });
    }
  });

  it("deleting a task removes its commit links", async () => {
    const { leader, project, tasks } = await setup();
    fetcher.mockResolvedValue(REPO_COMMITS);
    await sync(leader, project.id);
    expect((await request(app).delete(`/api/groups/${project.id}/tasks/${tasks[0]!.id}`).set("Authorization", as(leader))).status).toBe(200);
    expect(await prisma.taskCommitLink.count({ where: { taskId: tasks[0]!.id } })).toBe(0);
    expect(await prisma.taskCommitLink.count()).toBe(1);
  });
});

describe("PATCH /task-key (change the key, keep the old one working)", () => {
  const patch = (u: U, projectId: number, key: unknown) =>
    request(app).patch(`/api/groups/${projectId}/task-key`).set("Authorization", as(u)).send({ key });

  it("changes the key everywhere, keeps the old one as an alias, and old and new keys both link commits", async () => {
    const { leader, member, project, tasks } = await setup();
    const res = await patch(leader, project.id, " app ");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ taskKey: "APP", keyAliases: ["FT"] });

    const b = await board(member, project.id);
    expect(b.group).toMatchObject({ taskKey: "APP", keyAliases: ["FT"] });
    expect(b.tasks.map((t) => t.key)).toEqual(["APP-1", "APP-2", "APP-3"]);

    fetcher.mockResolvedValue([
      commit("a41f9c2d0000000000000000000000000000aaaa", "old style FT-1"),
      commit("b52e0d3e0000000000000000000000000000bbbb", "new style app-2"),
      commit("c63f1e4f0000000000000000000000000000cccc", "unknown GA-3"),
    ]);
    const synced = await sync(leader, project.id);
    expect(synced.body).toMatchObject({ linked: 2, matched: 2 });
    const links = await prisma.taskCommitLink.findMany({ orderBy: { taskId: "asc" } });
    expect(links.map((l) => l.taskId)).toEqual([tasks[0]!.id, tasks[1]!.id]);
  });

  it("keeps every earlier key working after several changes", async () => {
    const { leader, project } = await setup();
    expect((await patch(leader, project.id, "AB")).body.keyAliases).toEqual(["FT"]);
    const second = await patch(leader, project.id, "CD");
    expect(second.body).toEqual({ taskKey: "CD", keyAliases: ["AB", "FT"] });
    fetcher.mockResolvedValue([commit("a41f9c2d0000000000000000000000000000aaaa", "FT-1"), commit("b52e0d3e0000000000000000000000000000bbbb", "AB-2")]);
    expect((await sync(leader, project.id)).body.linked).toBe(2);
  });

  it("will not reuse an earlier key of this group", async () => {
    const { leader, project } = await setup();
    await patch(leader, project.id, "APP");
    const back = await patch(leader, project.id, "FT");
    expect(back.status).toBe(409);
    expect(back.body.error).toMatch(/was this group's key before/);
    expect((await board(leader, project.id)).group.taskKey).toBe("APP");
  });

  it("the same key again changes nothing; a bad key is a 400 with a plain message", async () => {
    const { leader, project } = await setup();
    const same = await patch(leader, project.id, "ft");
    expect(same.status).toBe(200);
    expect(same.body).toEqual({ taskKey: "FT", keyAliases: [] });
    for (const bad of ["", "A", "TOOLONG", "1AB", "A-B", 5]) {
      const r = await patch(leader, project.id, bad);
      expect(r.status, String(bad)).toBe(400);
      expect(r.body.error).toBeTruthy();
    }
    expect(await prisma.taskKeyAlias.count()).toBe(0);
  });

  it("is leader only", async () => {
    const { member, instructor, project } = await setup();
    expect((await patch(member, project.id, "APP")).status).toBe(403);
    expect((await patch(instructor, project.id, "APP")).status).toBe(403);
    expect((await board(member, project.id)).group.taskKey).toBe("FT");
  });

  it("a key that was never shown (no task ever created) gets no alias", async () => {
    const { leader, project } = await setup({ taskKey: null, tasks: 0 });
    await prisma.project.update({ where: { id: project.id }, data: { nextTaskNumber: 1 } });
    const res = await patch(leader, project.id, "APP");
    expect(res.body).toEqual({ taskKey: "APP", keyAliases: [] });
    // ...so the key it would have had can still be chosen later.
    expect((await patch(leader, project.id, "GA")).status).toBe(200);
  });
});

describe("linkCommitsToTasks and the Analyze hook (library level)", () => {
  it("another group's tasks are never linked: only this group's own task numbers count", async () => {
    const a = await setup();
    const b = await setup();
    await linkCommitsToTasks(a.project.id, "acme/app", [commit("a41f9c2d0000000000000000000000000000aaaa", "FT-1")]);
    expect(await prisma.taskCommitLink.count({ where: { taskId: a.tasks[0]!.id } })).toBe(1);
    expect(await prisma.taskCommitLink.count({ where: { taskId: b.tasks[0]!.id } })).toBe(0);
  });

  it("the same commit may link two different tasks, once each", async () => {
    const { project } = await setup();
    const c = commit("a41f9c2d0000000000000000000000000000aaaa", "FT-1 FT-2 FT-1");
    expect(await linkCommitsToTasks(project.id, "acme/app", [c])).toEqual({ matched: 1, linked: 2 });
    expect(await linkCommitsToTasks(project.id, "acme/app", [c])).toEqual({ matched: 1, linked: 0 });
  });

  it("the Analyze hook links commits after a report, and a failing GitHub read never throws", async () => {
    const { project } = await setup();
    const ok = vi.fn().mockResolvedValue([commit("a41f9c2d0000000000000000000000000000aaaa", "FT-2 done")]);
    await linkCommitsBestEffort({ id: project.id, repoUrl: "https://github.com/Acme/App" }, ok);
    expect(ok).toHaveBeenCalledWith("Acme", "App", "test-token");
    expect(await prisma.taskCommitLink.count()).toBe(1);

    const bad = vi.fn().mockRejectedValue(new Error("rate limited"));
    await expect(linkCommitsBestEffort({ id: project.id, repoUrl: "https://github.com/Acme/App" }, bad)).resolves.toBeUndefined();
    expect(bad).toHaveBeenCalled();
  });

  it("the hook does not call GitHub at all for a group with no tasks or no token", async () => {
    const { project } = await setup({ tasks: 0 });
    const spy = vi.fn().mockResolvedValue([]);
    await linkCommitsBestEffort({ id: project.id, repoUrl: "https://github.com/Acme/App" }, spy);
    expect(spy).not.toHaveBeenCalled();

    const withTasks = await setup();
    delete process.env.GITHUB_TOKEN;
    await linkCommitsBestEffort({ id: withTasks.project.id, repoUrl: "https://github.com/Acme/App" }, spy);
    expect(spy).not.toHaveBeenCalled();
  });
});

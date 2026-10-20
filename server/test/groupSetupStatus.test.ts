import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

async function setup(sourceType: "GITHUB" | "COMBINED" | "EDITOR", repoUrl: string | null) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id, repoUrl });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lea Leader" });
  const { user: member } = await createUser({ systemRole: "STUDENT", name: "Max Member" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  return { instructor, project, leader, member };
}

const get = (u: Parameters<typeof authHeaderFor>[0], id: number) =>
  request(app).get(`/api/groups/${id}/setup`).set("Authorization", authHeaderFor(u));

describe("GET /api/groups/:id/setup", () => {
  it("not started: no repo, nobody has a username; the member may add the first link", async () => {
    const { project, member } = await setup("GITHUB", null);
    const res = await get(member, project.id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      needsRepo: true, repoLinked: false, canLinkRepo: true, canChangeRepo: false, isLeader: false,
      viewerHasGithubUsername: false, usernames: { linked: 0, total: 2 },
    });
    expect(res.body.usernames.missingNames.sort()).toEqual(["Lea Leader", "Max Member"]);
  });

  it("partial: repo linked, one username set; only the leader may change the repo", async () => {
    const { project, leader, member } = await setup("COMBINED", "https://github.com/acme/app");
    await prisma.user.update({ where: { id: leader.id }, data: { githubUsername: "lea" } });
    const asMember = await get(member, project.id);
    expect(asMember.body).toMatchObject({ repoLinked: true, canLinkRepo: false, canChangeRepo: false, usernames: { linked: 1, total: 2, missingNames: ["Max Member"] } });
    const asLeader = await get(leader, project.id);
    expect(asLeader.body).toMatchObject({ canChangeRepo: true, viewerHasGithubUsername: true });
  });

  it("never sends usernames or emails", async () => {
    const { project, leader, member } = await setup("GITHUB", null);
    await prisma.user.update({ where: { id: leader.id }, data: { githubUsername: "secret-lea" } });
    const text = JSON.stringify((await get(member, project.id)).body);
    expect(text).not.toContain("secret-lea");
    expect(text).not.toContain("@");
  });

  it("Docs-only groups need no repository or usernames", async () => {
    const { project, member } = await setup("EDITOR", null);
    const res = await get(member, project.id);
    expect(res.body).toMatchObject({ needsRepo: false, canLinkRepo: false, canChangeRepo: false });
  });

  it("is members only", async () => {
    const { project, instructor } = await setup("GITHUB", null);
    expect((await get(instructor, project.id)).status).toBe(403);
  });
});

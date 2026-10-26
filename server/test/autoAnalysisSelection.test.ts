import { describe, it, expect } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { isProjectActive, selectDueGroups, ACTIVE_GRACE_DAYS } from "../src/lib/autoAnalysis.js";
import { createUser, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const NOW = new Date("2026-10-26T18:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("isProjectActive", () => {
  const created = new Date(NOW.getTime() - 10 * DAY);
  it("is active with no deadline, before the deadline and up to 7 days after it", () => {
    expect(isProjectActive({ createdAt: created, deadline: null }, NOW)).toBe(true);
    expect(isProjectActive({ createdAt: created, deadline: new Date(NOW.getTime() + DAY) }, NOW)).toBe(true);
    expect(isProjectActive({ createdAt: created, deadline: new Date(NOW.getTime() - (ACTIVE_GRACE_DAYS - 1) * DAY) }, NOW)).toBe(true);
  });
  it("is not active more than 7 days after the deadline or before it was created", () => {
    expect(isProjectActive({ createdAt: created, deadline: new Date(NOW.getTime() - (ACTIVE_GRACE_DAYS + 1) * DAY) }, NOW)).toBe(false);
    expect(isProjectActive({ createdAt: new Date(NOW.getTime() + DAY), deadline: null }, NOW)).toBe(false);
  });
});

describe("selectDueGroups", () => {
  async function setup(opts: { sourceType?: "GITHUB" | "EDITOR" | "COMBINED"; deadline?: Date | null; repoUrl?: string | null; members?: number }) {
    const { user } = await createUser();
    const cls = await createClassSection(user.id);
    const assignment = await createAssignment(cls.id, { sourceType: opts.sourceType });
    await prisma.assignment.update({ where: { id: assignment.id }, data: { deadline: opts.deadline ?? null } });
    const project = await createProject({ assignmentId: assignment.id, repoUrl: opts.repoUrl });
    for (let i = 0; i < (opts.members ?? 1); i++) {
      const { user: student } = await createUser({ systemRole: "STUDENT" });
      await createMembership(student.id, project.id, i === 0 ? "LEADER" : "MEMBER");
    }
    return project;
  }

  it("includes an active GitHub group with members and a repo", async () => {
    const p = await setup({});
    expect((await selectDueGroups(new Date())).map((g) => g.id)).toContain(p.id);
  });

  it("skips groups with no members, with no repo (GitHub/Combined), or past deadline + 7 days", async () => {
    const empty = await setup({ members: 0 });
    const noRepo = await setup({ repoUrl: null });
    const noRepoCombined = await setup({ sourceType: "COMBINED", repoUrl: null });
    const old = await setup({ deadline: new Date(Date.now() - (ACTIVE_GRACE_DAYS + 2) * DAY) });
    const ids = (await selectDueGroups(new Date())).map((g) => g.id);
    for (const p of [empty, noRepo, noRepoCombined, old]) expect(ids).not.toContain(p.id);
  });

  it("includes a Docs-only group without a repo", async () => {
    const p = await setup({ sourceType: "EDITOR", repoUrl: null });
    expect((await selectDueGroups(new Date())).map((g) => g.id)).toContain(p.id);
  });
});

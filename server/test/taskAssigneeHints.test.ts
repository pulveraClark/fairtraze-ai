import { beforeEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { ASSIGNEE_HINTS_TTL_MS, assigneeHintsFor, clearAssigneeHintsCache } from "../src/lib/taskAssigneeHints.js";
import { loadGroup } from "../src/lib/groupAccess.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

// The "Suggested" assignee reads the latest saved report. Only the leader receives the numbers it needs.
// Confirming a suggestion is an ordinary assign: it changes no report, share, flag, Gini or team health.

const app = createApp();

beforeEach(() => clearAssigneeHintsCache());

async function setup(withReport = true) {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "COMBINED" });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Christian Lenizo" });
  const { user: aldren } = await createUser({ systemRole: "STUDENT", name: "Aldren Baricuatro" });
  const { user: kient } = await createUser({ systemRole: "STUDENT", name: "Kient Cruz" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(aldren.id, project.id);
  await createMembership(kient.id, project.id);
  let report = null;
  if (withReport) {
    const content = JSON.stringify({
      report: {
        gini: 0.41, teamHealth: "High Risk", memberCount: 3,
        members: [
          { studentName: "Christian Lenizo", userId: leader.id, contributionShare: 0.413, flags: ["overload"] },
          { studentName: "Aldren Baricuatro", userId: aldren.id, contributionShare: 0.062, flags: ["free-rider"] },
          { studentName: "Kient Cruz", userId: kient.id, contributionShare: 0.062, flags: [] },
        ],
      },
    });
    report = await prisma.report.create({ data: { projectId: project.id, gini: 0.41, teamHealth: "High Risk", content } });
  }
  return { instructor, project, leader, aldren, kient, report, content: report?.content ?? null };
}

const board = (id: number, u: unknown) => request(app).get(`/api/groups/${id}/tasks`).set("Authorization", authHeaderFor(u as never));

describe("assigneeHints on the task board", () => {
  it("the leader gets share and overloaded per member, nothing else", async () => {
    const s = await setup();
    const res = await board(s.project.id, s.leader);
    expect(res.status).toBe(200);
    const hints = res.body.assigneeHints as Array<Record<string, unknown>>;
    expect(hints).toHaveLength(3);
    for (const h of hints) expect(Object.keys(h).sort()).toEqual(["overloaded", "share", "userId"]);
    expect(hints.find((h) => h.userId === s.leader.id)).toMatchObject({ share: 0.413, overloaded: true });
    expect(hints.find((h) => h.userId === s.aldren.id)).toMatchObject({ share: 0.062, overloaded: false });
    const text = JSON.stringify(hints);
    expect(text).not.toMatch(/free[\s-]?rider|gini|band|health|risk/i);
  });

  it("a member and the instructor get no hints", async () => {
    const s = await setup();
    expect((await board(s.project.id, s.aldren)).body.assigneeHints).toBeUndefined();
    expect((await board(s.project.id, s.instructor)).body.assigneeHints).toBeUndefined();
  });

  it("with no saved report every share is null and nobody is overloaded; the board still loads", async () => {
    const s = await setup(false);
    const res = await board(s.project.id, s.leader);
    expect(res.status).toBe(200);
    expect(res.body.assigneeHints).toHaveLength(3);
    for (const h of res.body.assigneeHints) expect(h).toMatchObject({ share: null, overloaded: false });
  });
});

describe("confirming a suggestion changes no score", () => {
  it("assigning the suggested member leaves the saved report byte for byte the same", async () => {
    const s = await setup();
    const made = await request(app).post(`/api/groups/${s.project.id}/tasks`).set("Authorization", authHeaderFor(s.leader as never)).send({ title: "RTB-7 task" });
    expect(made.status).toBe(201);
    const before = await prisma.report.findMany({ where: { projectId: s.project.id } });
    const assigned = await request(app)
      .patch(`/api/groups/${s.project.id}/tasks/${made.body.id}`)
      .set("Authorization", authHeaderFor(s.leader as never))
      .send({ assignedToUserId: s.aldren.id, expectedVersion: made.body.version });
    expect(assigned.status).toBe(200);
    expect(assigned.body.assignedToUserId).toBe(s.aldren.id);
    const after = await prisma.report.findMany({ where: { projectId: s.project.id } });
    expect(after).toEqual(before);
    expect(after[0]!.content).toBe(s.content);
    expect(after[0]!.gini).toBe(0.41);
    expect(after[0]!.teamHealth).toBe("High Risk");
  });
});

describe("assigneeHints cache (60 s per group)", () => {
  it("two polls inside 60 s read the report once; after 60 s it reads again", async () => {
    const s = await setup();
    const spy = vi.spyOn(prisma.report, "findFirst");
    try {
      const a = await board(s.project.id, s.leader);
      const b = await board(s.project.id, s.leader);
      expect(b.body.assigneeHints).toEqual(a.body.assigneeHints);
      expect(spy).toHaveBeenCalledTimes(1);

      const project = (await loadGroup(s.project.id))!;
      await assigneeHintsFor(project, Date.now() + ASSIGNEE_HINTS_TTL_MS + 1);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("a member change refreshes it at once", async () => {
    const s = await setup();
    const spy = vi.spyOn(prisma.report, "findFirst");
    try {
      await board(s.project.id, s.leader);
      const { user: newcomer } = await createUser({ systemRole: "STUDENT" });
      await createMembership(newcomer.id, s.project.id);
      const res = await board(s.project.id, s.leader);
      expect(res.body.assigneeHints).toHaveLength(4);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("members and the instructor never trigger the read", async () => {
    const s = await setup();
    const spy = vi.spyOn(prisma.report, "findFirst");
    try {
      await board(s.project.id, s.aldren);
      await board(s.project.id, s.instructor);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "../../test/factories.js";
import { prisma } from "../lib/prisma.js";
import { buildTaskSummary } from "./projects.js";

const app = createApp();

describe("buildTaskSummary", () => {
  it("counts completed vs. total tasks assigned to a specific member", () => {
    const tasks = [
      { assignedToUserId: 1, done: true },
      { assignedToUserId: 1, done: false },
      { assignedToUserId: 1, done: true },
      { assignedToUserId: 2, done: true },
    ];
    expect(buildTaskSummary(tasks, 1)).toEqual({ completed: 2, total: 3 });
  });

  it("returns zero/zero for a member with no assigned tasks", () => {
    const tasks = [{ assignedToUserId: 2, done: true }];
    expect(buildTaskSummary(tasks, 1)).toEqual({ completed: 0, total: 0 });
  });

  it("ignores unassigned tasks (assignedToUserId: null)", () => {
    const tasks = [{ assignedToUserId: null, done: true }, { assignedToUserId: 1, done: false }];
    expect(buildTaskSummary(tasks, 1)).toEqual({ completed: 0, total: 1 });
  });

  it("returns zero/zero when there are no tasks at all", () => {
    expect(buildTaskSummary([], 1)).toEqual({ completed: 0, total: 0 });
  });
});

describe("GET /api/projects/:id/report — taskSummary joined per member", () => {
  it("reflects each member's own completed/total task counts, not another member's", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment   = await createAssignment(classSection.id);
    const project       = await createProject({ assignmentId: assignment.id });

    const { user: alice } = await createUser({ systemRole: "STUDENT", name: "Alice" });
    const { user: bob }   = await createUser({ systemRole: "STUDENT", name: "Bob" });
    await createMembership(alice.id, project.id, "LEADER");
    await createMembership(bob.id, project.id, "MEMBER");

    // Alice: 2 tasks, 1 done. Bob: 1 task, 0 done.
    await prisma.task.createMany({
      data: [
        { projectId: project.id, title: "A1", assignedToUserId: alice.id, createdByUserId: alice.id, done: true },
        { projectId: project.id, title: "A2", assignedToUserId: alice.id, createdByUserId: alice.id, done: false },
        { projectId: project.id, title: "B1", assignedToUserId: bob.id, createdByUserId: alice.id, done: false },
      ],
    });

    // Minimal stored report — the report route only reads stored.report.members
    // for the mismatch-note/task-summary join; other ScoredMember fields aren't
    // touched by this route and are omitted here.
    await prisma.report.create({
      data: {
        projectId: project.id,
        gini: 0,
        teamHealth: "Healthy",
        content: JSON.stringify({
          report: { members: [], memberCount: 2, gini: 0, teamHealth: "Healthy" },
          narrative: null,
          unmatchedLogins: [],
        }),
      },
    });

    const res = await request(app)
      .get(`/api/projects/${project.id}/report`)
      .set("Authorization", authHeaderFor(instructor));

    expect(res.status).toBe(200);
    const roles = res.body.memberRoles as { userId: number; taskSummary: { completed: number; total: number } }[];
    expect(roles.find((r) => r.userId === alice.id)?.taskSummary).toEqual({ completed: 1, total: 2 });
    expect(roles.find((r) => r.userId === bob.id)?.taskSummary).toEqual({ completed: 0, total: 1 });
  });
});

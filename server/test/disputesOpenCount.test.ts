import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

const { createApp } = await import("../src/app.js");
const app = createApp();

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group A" });
  await createMembership(student.id, project.id, "LEADER");
  const make = (status: "OPEN" | "RESOLVED") =>
    prisma.dispute.create({
      data: { projectId: project.id, studentUserId: student.id, memberName: student.name, reason: "Offline work", disputedFlags: "[]", status },
    });
  return { instructor, student, make };
}

describe("GET /api/disputes/open-count", () => {
  it("returns only { openCount }: open disputes in the instructor's own classes", async () => {
    const { instructor, make } = await setup();
    await make("OPEN");
    await make("OPEN");
    await make("RESOLVED");
    // Another instructor's open dispute must not count.
    await setup().then((o) => o.make("OPEN"));

    const res = await request(app).get("/api/disputes/open-count").set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ openCount: 2 });
  });

  it("is 0 with no disputes, and students and admins get 403", async () => {
    const { instructor, student } = await setup();
    const { user: admin } = await createUser({ systemRole: "ADMIN" });

    const zero = await request(app).get("/api/disputes/open-count").set("Authorization", authHeaderFor(instructor));
    expect(zero.body).toEqual({ openCount: 0 });
    expect((await request(app).get("/api/disputes/open-count").set("Authorization", authHeaderFor(student))).status).toBe(403);
    expect((await request(app).get("/api/disputes/open-count").set("Authorization", authHeaderFor(admin))).status).toBe(403);
  });
});

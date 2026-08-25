import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
} from "./factories.js";

const app = createApp();

async function enroll(userId: number, classSectionId: number) {
  return prisma.classEnrollment.create({ data: { userId, classSectionId } });
}

describe("requireVerifiedEmail soft gate", () => {
  it("blocks an unverified STUDENT from creating a group with EMAIL_NOT_VERIFIED", async () => {
    const { user } = await createUser({ systemRole: "STUDENT", emailVerified: false });

    const res = await request(app)
      .post("/api/join/create-group")
      .set("Authorization", authHeaderFor(user))
      .send({ assignmentId: 1, groupName: "Whatever" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows a verified STUDENT past the gate to create a group", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id);
    const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });
    await enroll(student.id, classSection.id);

    const res = await request(app)
      .post("/api/join/create-group")
      .set("Authorization", authHeaderFor(student))
      .send({ assignmentId: assignment.id, groupName: "Group Alpha", repoUrl: "https://github.com/acme/repo" });

    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe("EMAIL_NOT_VERIFIED");
  });

  it("blocks an unverified STUDENT from joining a group with EMAIL_NOT_VERIFIED", async () => {
    const { user } = await createUser({ systemRole: "STUDENT", emailVerified: false });

    const res = await request(app)
      .post("/api/join/join-group")
      .set("Authorization", authHeaderFor(user))
      .send({ projectGroupId: 1 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows a verified STUDENT past the gate to join a group", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id);
    const project = await createProject({ assignmentId: assignment.id });
    const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });
    await enroll(student.id, classSection.id);

    const res = await request(app)
      .post("/api/join/join-group")
      .set("Authorization", authHeaderFor(student))
      .send({ projectGroupId: project.id });

    expect(res.status).not.toBe(403);
    expect(res.body.code).not.toBe("EMAIL_NOT_VERIFIED");
  });

  it("blocks an unverified INSTRUCTOR from triggering analyze with EMAIL_NOT_VERIFIED", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", emailVerified: false });

    const res = await request(app)
      .post("/api/projects/1/analyze")
      .set("Authorization", authHeaderFor(user));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows a verified INSTRUCTOR past the gate on analyze", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR", emailVerified: true });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id);
    const project = await createProject({ assignmentId: assignment.id });

    const res = await request(app)
      .post(`/api/projects/${project.id}/analyze`)
      .set("Authorization", authHeaderFor(instructor));

    expect(res.status).not.toBe(403);
  });

  it("blocks an unverified INSTRUCTOR from requesting a narrative with EMAIL_NOT_VERIFIED", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", emailVerified: false });

    const res = await request(app)
      .post("/api/projects/1/narrative")
      .set("Authorization", authHeaderFor(user));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("passes through without a DB check when REQUIRE_EMAIL_VERIFICATION=false", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR", emailVerified: false });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id);
    const project = await createProject({ assignmentId: assignment.id });

    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    try {
      const res = await request(app)
        .post(`/api/projects/${project.id}/analyze`)
        .set("Authorization", authHeaderFor(instructor));

      expect(res.status).not.toBe(403);
      expect(res.body.code).not.toBe("EMAIL_NOT_VERIFIED");
    } finally {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
  });
});

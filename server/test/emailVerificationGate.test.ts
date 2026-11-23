import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import {
  createUser,
  authHeaderFor,
  CONSENT,
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

  // INT-034
  it("an unverified student gets the plain message, then the SAME user creates the group after verifying", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id);
    const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: false });
    await enroll(student.id, classSection.id);
    const body = { assignmentId: assignment.id, groupName: "Group Verify" };

    const blocked = await request(app).post("/api/join/create-group").set("Authorization", authHeaderFor(student)).send(body);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("Please verify your email before doing this. Check your inbox or use Resend email at the top of the page.");
    expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(await prisma.project.count({ where: { assignmentId: assignment.id } })).toBe(0);

    const { issueVerificationToken } = await import("../src/lib/emailVerification.js");
    const rawToken = await issueVerificationToken(student.id);
    const verified = await request(app).post("/api/auth/verify-email").send({ token: rawToken });
    expect(verified.status).toBe(200);

    const created = await request(app).post("/api/join/create-group").set("Authorization", authHeaderFor(student)).send(body);
    expect(created.status).toBe(201);
    expect(await prisma.project.count({ where: { assignmentId: assignment.id } })).toBe(1);
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

  it("blocks an unverified STUDENT from requesting to join a group with EMAIL_NOT_VERIFIED", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: false });
    await enroll(student.id, classSection.id);

    const res = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(student));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows a verified STUDENT past the gate to request to join a group", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: assignment.id });
    const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: true });
    await enroll(student.id, classSection.id);

    const res = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(student));

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

  // AUTH-36: documents the live finding. With the gate off, a sign-up is stored UNVERIFIED (email is on) yet
  // can create a group; nothing is blocked and no verification email is sent.
  it("with REQUIRE_EMAIL_VERIFICATION=false a new unverified student is NOT blocked from creating a group", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id);

    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    try {
      const reg = await request(app).post("/api/auth/register").send({
        ...CONSENT, email: "gateoff@example.com", password: "password123", name: "Gate Off", role: "STUDENT",
      });
      expect(reg.status).toBe(201);
      expect((await prisma.user.findUnique({ where: { email: "gateoff@example.com" } }))?.emailVerified).toBe(false);
      expect(await prisma.emailVerificationToken.count({ where: { userId: reg.body.user.id } })).toBe(0);

      await enroll(reg.body.user.id, classSection.id);
      const res = await request(app)
        .post("/api/join/create-group")
        .set("Authorization", `Bearer ${reg.body.token}`)
        .send({ assignmentId: assignment.id, groupName: "Gate Off Group" });
      expect(res.status).toBe(201);
    } finally {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    }
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

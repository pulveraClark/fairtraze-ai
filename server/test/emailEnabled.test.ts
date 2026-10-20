import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, CONSENT } from "./factories.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../src/lib/email.js";

// Not testing rate limits here (see emailVerificationGate / auth tests).
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>("../src/middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const resendSend = vi.fn().mockResolvedValue({});
vi.mock("resend", () => ({ Resend: class { emails = { send: resendSend }; } }));

const { createApp } = await import("../src/app.js");
const app = createApp();

beforeEach(() => {
  vi.mocked(sendVerificationEmail).mockClear();
  vi.mocked(sendPasswordResetEmail).mockClear();
  resendSend.mockClear();
});
afterEach(() => {
  delete process.env.EMAIL_ENABLED;
});

describe("EMAIL_ENABLED unset / true (current behaviour)", () => {
  it.each([undefined, "true"])("EMAIL_ENABLED=%s: sign-up is unverified, a verification email is sent, config says on", async (value) => {
    if (value !== undefined) process.env.EMAIL_ENABLED = value;

    const res = await request(app).post("/api/auth/register").send({ ...CONSENT, email: "on@example.com", password: "password123", name: "On" });
    expect(res.status).toBe(201);
    expect(res.body.user.emailVerified).toBe(false);
    expect(res.body.emailVerificationRequired).toBe(true);
    expect(res.body.emailEnabled).toBe(true);
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);

    expect((await request(app).get("/api/config")).body).toEqual({ emailEnabled: true });
  });

  it("forgot-password and resend-verification still send", async () => {
    const { user } = await createUser({ email: "reset@example.com", emailVerified: false });
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: "reset@example.com" });
    expect(forgot.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    const resend = await request(app).post("/api/auth/resend-verification").set("Authorization", authHeaderFor(user));
    expect(resend.body.message).toBe("Verification email sent.");
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("the real senders call Resend", async () => {
    const real = await vi.importActual<typeof import("../src/lib/email.js")>("../src/lib/email.js");
    await real.sendVerificationEmail("a@example.com", "A", "http://x/v");
    await real.sendPasswordResetEmail("a@example.com", "A", "http://x/r");
    expect(resendSend).toHaveBeenCalledTimes(2);
  });
});

describe("EMAIL_ENABLED=false", () => {
  beforeEach(() => {
    process.env.EMAIL_ENABLED = "false";
  });

  it("verifies new sign-ups automatically and sends nothing", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...CONSENT, email: "off@example.com", password: "password123", name: "Off" });
    expect(res.status).toBe(201);
    expect(res.body.user.emailVerified).toBe(true);
    expect(res.body.emailVerificationRequired).toBe(false);
    expect(res.body.emailEnabled).toBe(false);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect((await prisma.user.findUnique({ where: { email: "off@example.com" } }))?.emailVerified).toBe(true);
    expect(await prisma.emailVerificationToken.count()).toBe(0);
  });

  it("reports email off on /api/config, login and /me, and treats an existing unverified user as verified", async () => {
    expect((await request(app).get("/api/config")).body).toEqual({ emailEnabled: false });

    const { user } = await createUser({ email: "old@example.com", password: "password123", emailVerified: false });
    const login = await request(app).post("/api/auth/login").send({ email: "old@example.com", password: "password123" });
    expect(login.body.user.emailVerified).toBe(true);
    expect(login.body.emailEnabled).toBe(false);

    const me = await request(app).get("/api/auth/me").set("Authorization", authHeaderFor(user));
    expect(me.body.emailVerified).toBe(true);
    expect(me.body.emailEnabled).toBe(false);
    expect(me.body.emailVerificationRequired).toBe(false);
  });

  it("forgot-password answers 503 EMAIL_DISABLED and sends nothing", async () => {
    await createUser({ email: "fp@example.com" });
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "fp@example.com" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("EMAIL_DISABLED");
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  it("resend-verification sends nothing", async () => {
    const { user } = await createUser({ emailVerified: false });
    const res = await request(app).post("/api/auth/resend-verification").set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(await prisma.emailVerificationToken.count()).toBe(0);
  });

  it("does not block an unverified student from creating or joining a group, or an instructor from analysing", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR", emailVerified: false });
    const classSection = await createClassSection(instructor.id);
    const assignment = await createAssignment(classSection.id);
    const editorAssignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: editorAssignment.id });
    const { user: student } = await createUser({ systemRole: "STUDENT", emailVerified: false });
    await prisma.classEnrollment.create({ data: { userId: student.id, classSectionId: classSection.id } });

    const create = await request(app).post("/api/join/create-group").set("Authorization", authHeaderFor(student))
      .send({ assignmentId: assignment.id, groupName: "Group Alpha" });
    const join = await request(app).post(`/api/groups/${project.id}/request`).set("Authorization", authHeaderFor(student));
    const analyze = await request(app).post(`/api/projects/${project.id}/analyze`).set("Authorization", authHeaderFor(instructor));
    const narrative = await request(app).post(`/api/projects/${project.id}/narrative`).set("Authorization", authHeaderFor(instructor));

    for (const res of [create, join, analyze, narrative]) {
      expect(res.body.code).not.toBe("EMAIL_NOT_VERIFIED");
    }
  });

  it("the real senders never call Resend", async () => {
    const real = await vi.importActual<typeof import("../src/lib/email.js")>("../src/lib/email.js");
    await real.sendVerificationEmail("a@example.com", "A", "http://x/v");
    await real.sendPasswordResetEmail("a@example.com", "A", "http://x/r");
    expect(resendSend).not.toHaveBeenCalled();
  });
});

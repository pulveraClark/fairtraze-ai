import { describe, it, expect } from "vitest";
import request from "supertest";
import { PRIVACY_NOTICE_VERSION } from "@shared/privacyNotice.js";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, CONSENT } from "./factories.js";

const app = createApp();
const base = { email: "c@example.com", password: "password123", name: "C" };

describe("sign-up consent", () => {
  it("rejects sign-up without acceptPrivacy and creates no account", async () => {
    const res = await request(app).post("/api/auth/register").send(base);
    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: base.email } })).toBeNull();
  });

  it("rejects acceptPrivacy: false", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...base, acceptPrivacy: false, privacyVersion: PRIVACY_NOTICE_VERSION });
    expect(res.status).toBe(400);
  });

  it("rejects an outdated notice version", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...base, acceptPrivacy: true, privacyVersion: "0.0-old" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NOTICE_VERSION_MISMATCH");
    expect(await prisma.user.findUnique({ where: { email: base.email } })).toBeNull();
  });

  it("stores the accepted version and a timestamp", async () => {
    const res = await request(app).post("/api/auth/register").send({ ...base, ...CONSENT });
    expect(res.status).toBe(201);
    expect(res.body.user.consentRequired).toBe(false);
    const row = await prisma.user.findUnique({ where: { email: base.email } });
    expect(row?.consentVersion).toBe(PRIVACY_NOTICE_VERSION);
    expect(row?.consentAcceptedAt).toBeInstanceOf(Date);
  });
});

describe("existing users must accept the current notice", () => {
  it("/me reports consentRequired for a user who never consented, and POST /consent clears it", async () => {
    const { user } = await createUser({ systemRole: "STUDENT", consentVersion: null });

    const before = await request(app).get("/api/auth/me").set("Authorization", authHeaderFor(user));
    expect(before.status).toBe(200);
    expect(before.body.consentRequired).toBe(true);

    const accept = await request(app).post("/api/privacy/consent").set("Authorization", authHeaderFor(user)).send({ version: PRIVACY_NOTICE_VERSION });
    expect(accept.status).toBe(200);

    const after = await request(app).get("/api/auth/me").set("Authorization", authHeaderFor(user));
    expect(after.body.consentRequired).toBe(false);
    expect(after.body.consentVersion).toBe(PRIVACY_NOTICE_VERSION);
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.consentAcceptedAt).toBeInstanceOf(Date);
  });

  it("login reports consentRequired when the stored version is older than the current one", async () => {
    const { user, password } = await createUser({ systemRole: "STUDENT", consentVersion: "0.9-old" });
    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(res.status).toBe(200);
    expect(res.body.user.consentRequired).toBe(true);
  });

  it("refuses to record consent to a version other than the current one", async () => {
    const { user } = await createUser({ systemRole: "STUDENT", consentVersion: null });
    const res = await request(app).post("/api/privacy/consent").set("Authorization", authHeaderFor(user)).send({ version: "0.9-old" });
    expect(res.status).toBe(409);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.consentVersion).toBeNull();
  });
});

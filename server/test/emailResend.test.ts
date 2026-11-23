import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";

// The resend limiter is tested in emailResendLimiter.test.ts; here it is a pass-through (as groupRepoLink.test.ts does).
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>("../src/middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough, resendVerificationLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const { sendVerificationEmail } = await import("../src/lib/email.js");
const send = vi.mocked(sendVerificationEmail);
const app = createApp();

describe("resend verification", () => {
  beforeEach(() => { send.mockReset(); send.mockResolvedValue(true); });

  // AUTH-34
  it("a provider failure answers 502 with a calm message, never 'Verification email sent.'", async () => {
    const { user } = await createUser({ email: "rfail@example.com", emailVerified: false });
    send.mockRejectedValueOnce(new Error("mail provider answered 500"));

    const res = await request(app).post("/api/auth/resend-verification").set("Authorization", authHeaderFor(user));

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Could not send the email. Try again in a minute.");
    expect(JSON.stringify(res.body)).not.toContain("Verification email sent.");
  });

  // AUTH-34
  it("mail not configured (sender returns false) is also an error, not 'sent'", async () => {
    const { user } = await createUser({ email: "rnoconf@example.com", emailVerified: false });
    send.mockResolvedValueOnce(false);

    const res = await request(app).post("/api/auth/resend-verification").set("Authorization", authHeaderFor(user));

    expect(res.status).toBe(502);
    expect(res.body.code).toBe("EMAIL_SEND_FAILED");
  });

  // AUTH-32
  it("a resend leaves exactly one live token for the user", async () => {
    const { user } = await createUser({ email: "rone@example.com", emailVerified: false });
    const auth = authHeaderFor(user);

    expect((await request(app).post("/api/auth/resend-verification").set("Authorization", auth)).status).toBe(200);
    expect((await request(app).post("/api/auth/resend-verification").set("Authorization", auth)).status).toBe(200);

    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(1);
  });
});

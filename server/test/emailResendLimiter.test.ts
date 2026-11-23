import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor } from "./factories.js";

// Real resend limiter on purpose; only the other limiters are passed through.
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>("../src/middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const { sendVerificationEmail } = await import("../src/lib/email.js");
const app = createApp();

describe("resend verification limiter", () => {
  // AUTH-33
  it("allows 5 per hour per user, then 429 with the plain message; another user is not affected", async () => {
    vi.mocked(sendVerificationEmail).mockResolvedValue(true);
    const { user } = await createUser({ email: "rlimit@example.com", emailVerified: false });
    const { user: other } = await createUser({ email: "rlimit2@example.com", emailVerified: false });
    const auth = authHeaderFor(user);

    for (let i = 0; i < 5; i++) {
      expect((await request(app).post("/api/auth/resend-verification").set("Authorization", auth)).status).toBe(200);
    }
    const sixth = await request(app).post("/api/auth/resend-verification").set("Authorization", auth);
    expect(sixth.status).toBe(429);
    expect(sixth.body.error).toBe("Too many requests. Please wait a few minutes and try again.");

    const fine = await request(app).post("/api/auth/resend-verification").set("Authorization", authHeaderFor(other));
    expect(fine.status).toBe(200);
  });
});

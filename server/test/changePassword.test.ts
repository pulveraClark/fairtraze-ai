import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createUser, authHeaderFor } from "./factories.js";

// Same reason as auth.test.ts: this file is about the change-password route, not rate limiting.
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>("../src/middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const app = createApp();

const login = (email: string, password: string) => request(app).post("/api/auth/login").send({ email, password });

describe("POST /api/users/me/password", () => {
  // PRV-09
  it("changes the password: the new one signs in and the old one is refused", async () => {
    const { user } = await createUser({ email: "changepw@example.com", password: "old-password1" });

    const res = await request(app)
      .post("/api/users/me/password")
      .set("Authorization", authHeaderFor(user))
      .send({ currentPassword: "old-password1", newPassword: "new-password1" });
    expect(res.status).toBe(200);

    expect((await login("changepw@example.com", "new-password1")).status).toBe(200);
    const old = await login("changepw@example.com", "old-password1");
    expect(old.status).toBe(401);
    expect(old.body.error).toBe("Invalid email or password");
  });

  // PRV-10
  it("refuses a wrong current password and leaves the password unchanged", async () => {
    const { user } = await createUser({ email: "wrongcurrent@example.com", password: "old-password1" });

    const res = await request(app)
      .post("/api/users/me/password")
      .set("Authorization", authHeaderFor(user))
      .send({ currentPassword: "not-my-password", newPassword: "new-password1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Current password is incorrect");

    expect((await login("wrongcurrent@example.com", "old-password1")).status).toBe(200);
    expect((await login("wrongcurrent@example.com", "new-password1")).status).toBe(401);
  });

  // PRV-10
  it("refuses a 7-character new password and leaves the password unchanged", async () => {
    const { user } = await createUser({ email: "sevenchars@example.com", password: "old-password1" });

    const res = await request(app)
      .post("/api/users/me/password")
      .set("Authorization", authHeaderFor(user))
      .send({ currentPassword: "old-password1", newPassword: "1234567" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("New password must be at least 8 characters");

    expect((await login("sevenchars@example.com", "old-password1")).status).toBe(200);
    expect((await login("sevenchars@example.com", "1234567")).status).toBe(401);
  });
});

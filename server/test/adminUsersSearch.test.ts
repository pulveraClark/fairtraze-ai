import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

describe("GET /api/admin/users search", () => {
  it("matches names case-insensitively", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: target } = await createUser({ name: "Zebulon Quixote" });

    const res = await request(app)
      .get("/api/admin/users")
      .query({ search: "zebulon quixote" })
      .set("Authorization", authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { id: number }) => u.id)).toContain(target.id);
  });

  it("matches emails case-insensitively", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: target } = await createUser({ email: "MixedCase.Person@Example.com" });

    const res = await request(app)
      .get("/api/admin/users")
      .query({ search: "mixedcase.person@example.com" })
      .set("Authorization", authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { id: number }) => u.id)).toContain(target.id);
  });
});

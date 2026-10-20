import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

describe("GET /api/admin/overview", () => {
  it("returns account counts only, never class, group, report or dispute figures", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const res = await request(app).get("/api/admin/overview").set("Authorization", authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["users"]);
    expect(Object.keys(res.body.users).sort()).toEqual(["active", "admins", "inactive", "instructors", "students", "total"]);
    expect(res.body.users.active + res.body.users.inactive).toBe(res.body.users.total);
  });

  it("is admin only", async () => {
    const { user: student } = await createUser({ systemRole: "STUDENT" });
    const res = await request(app).get("/api/admin/overview").set("Authorization", authHeaderFor(student));
    expect(res.status).toBe(403);
  });
});

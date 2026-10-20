import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// joinCodeLimiter is a module-level singleton (20 per minute); this file has its own module registry, so
// counts start at zero. No database: unauthenticated requests are keyed by IP and refused by the route
// itself (401) after the limiter has counted them, which proves the limiter sits in front of both routes.

const app = createApp();

describe("class join code rate limit", () => {
  it("the lookup (GET) and the enrol (POST) share one 20-per-minute bucket", async () => {
    for (let i = 0; i < 10; i++) expect((await request(app).get("/api/join/class/ABC123")).status).toBe(401);
    for (let i = 0; i < 10; i++) expect((await request(app).post("/api/join/class").send({ joinCode: "ABC123" })).status).toBe(401);

    const getLimited = await request(app).get("/api/join/class/ABC123");
    expect(getLimited.status).toBe(429);
    expect(getLimited.body.error).toMatch(/join codes too quickly/i);

    const postLimited = await request(app).post("/api/join/class").send({ joinCode: "ABC123" });
    expect(postLimited.status).toBe(429);
  });
});

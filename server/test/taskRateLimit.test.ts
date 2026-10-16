import express from "express";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { authenticateToken } from "../src/middleware/auth.js";
import { taskWriteLimiter } from "../src/middleware/security.js";
import { signToken } from "../src/lib/jwt.js";

// taskWriteLimiter is a module-level singleton (30 per minute per user); this file has its own module
// registry, so counts start at zero here. Neither test touches the database (the remote test database
// is too slow for 30+ sequential requests inside the one-minute window).

const app = createApp();

const tokenFor = (sub: number) =>
  signToken({ sub, email: `student${sub}@example.com`, name: `Student ${sub}`, role: "STUDENT" });

describe("task creation burst limit", () => {
  it("is wired to POST /api/groups/:id/tasks in the real app: the 31st request in a minute gets a friendly 429", async () => {
    // Unauthenticated requests are keyed by IP and are refused by the route itself (401) after the limiter
    // has counted them, which proves the limiter sits in front of the route without needing any data.
    const attempt = () => request(app).post("/api/groups/1/tasks").send({ title: "x" });
    for (let i = 0; i < 30; i++) expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/too quickly/i);
  });

  it("counts per user, not per IP: one user's burst does not block another", async () => {
    const probe = express();
    probe.post("/probe", authenticateToken, taskWriteLimiter, (req, res) => res.json({ userId: req.user?.sub ?? null }));

    const post = (sub: number) => request(probe).post("/probe").set("Authorization", `Bearer ${tokenFor(sub)}`);
    for (let i = 0; i < 30; i++) expect((await post(1)).status).toBe(200);
    const blocked = await post(1);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too quickly/i);
    expect((await post(2)).status).toBe(200);
  });
});

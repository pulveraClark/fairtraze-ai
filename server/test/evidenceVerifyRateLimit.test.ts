import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// evidenceVerifyLimiter is a module-level singleton (10 per minute); this file has its own module
// registry, so counts start at zero. No database: unauthenticated requests are keyed by IP and refused
// by the route (401) after the limiter has counted them, which proves the limiter sits in front of it.

const app = createApp();

describe("verify report rate limit", () => {
  it("allows 10 lookups a minute, then answers 429", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post("/api/evidence-reports/verify").send({ code: "FT-AAAA-AA" })).status).toBe(401);
    }
    const limited = await request(app).post("/api/evidence-reports/verify").send({ code: "FT-AAAA-AA" });
    expect(limited.status).toBe(429);
    expect(limited.body.error).toMatch(/report ids too quickly/i);
  });
});

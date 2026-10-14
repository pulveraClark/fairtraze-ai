import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

// Own file: the limiter is a module-level singleton keyed by user id, and ids restart after each
// test's TRUNCATE, so sharing a file with other export tests would let their requests count here.
const app = createApp();

describe("GET /api/privacy/export rate limit", () => {
  it("allows 5 exports per hour per user, then returns 429", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await request(app).get("/api/privacy/export").set("Authorization", authHeaderFor(user))).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });
});

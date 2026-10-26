import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

vi.mock("../src/lib/autoAnalysis.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/autoAnalysis.js")>()),
  startAutoAnalysisInBackground: vi.fn(() => ({ started: true })),
}));

import { createApp } from "../src/app.js";
import { startAutoAnalysisInBackground } from "../src/lib/autoAnalysis.js";

const SECRET = "test-secret-value-1234567890";
const app = createApp();
const start = vi.mocked(startAutoAnalysisInBackground);

describe("POST /api/internal/analyze-due", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    start.mockClear();
    start.mockReturnValue({ started: true });
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("401 without the header, with a wrong secret, or with an empty one - and starts nothing", async () => {
    expect((await request(app).post("/api/internal/analyze-due")).status).toBe(401);
    expect((await request(app).post("/api/internal/analyze-due").set("x-cron-secret", "wrong")).status).toBe(401);
    expect((await request(app).post("/api/internal/analyze-due").set("x-cron-secret", SECRET + "x")).status).toBe(401);
    expect((await request(app).post("/api/internal/analyze-due").set("x-cron-secret", "")).status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("a user token is not a substitute for the secret", async () => {
    const res = await request(app).post("/api/internal/analyze-due").set("Authorization", "Bearer anything");
    expect(res.status).toBe(401);
    expect(start).not.toHaveBeenCalled();
  });

  it("202 with the right secret, and the run is started in the background", async () => {
    const res = await request(app).post("/api/internal/analyze-due").set("x-cron-secret", SECRET);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, running: false });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("202 and no second run while one is already going", async () => {
    start.mockReturnValue({ started: false });
    const res = await request(app).post("/api/internal/analyze-due").set("x-cron-secret", SECRET);
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true, running: true });
  });

  it("503 when CRON_SECRET is not set, even if the caller sends an empty header", async () => {
    delete process.env.CRON_SECRET;
    expect((await request(app).post("/api/internal/analyze-due").set("x-cron-secret", "")).status).toBe(503);
    expect((await request(app).post("/api/internal/analyze-due").set("x-cron-secret", "x")).status).toBe(503);
    expect(start).not.toHaveBeenCalled();
  });
});

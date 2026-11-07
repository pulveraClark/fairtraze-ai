import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";
import { SERVER_ERROR_TEXT } from "@shared/failureMessages.js";

const app = createApp();

describe("the global error handler", () => {
  it("answers an uncaught server error with one generic sentence, and logs the real error", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma.alert, "findMany").mockRejectedValue(new Error("secret detail: relation \"Alert\" at host db.internal"));

    const res = await request(app).get("/api/alerts").set("Authorization", authHeaderFor(user));

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: "SERVER_ERROR", error: SERVER_ERROR_TEXT });
    expect(JSON.stringify(res.body)).not.toMatch(/secret|relation|db\.internal/);
    expect(log.mock.calls.some((c) => String(c[0]).includes("secret detail"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("keeps the message and the 4xx status for a request the client got wrong (malformed JSON)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{ not json");
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.code).toBeUndefined();
    vi.restoreAllMocks();
  });
});

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { requestTiming, formatTimingLine, isTimingEnabled, routePattern, SLOW_REQUEST_MS } from "../src/middleware/requestTiming.js";
import { addTimingMs, countQuery } from "../src/lib/queryCounter.js";

function appWith(env: NodeJS.ProcessEnv, lines: string[], countsQueries = true) {
  const app = express();
  app.use(requestTiming({ env, log: (l) => lines.push(l), countsQueries }));
  app.get("/api/groups/:id/tasks", (_req, res) => {
    countQuery();
    countQuery();
    res.json({ ok: true });
  });
  app.post("/login-like", (_req, res) => {
    addTimingMs("bcrypt", 212.4);
    res.status(401).json({ error: "no" });
  });
  return app;
}

const ON = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
// supertest answers before "finish" listeners are guaranteed to have run on the server side, so wait a tick.
const tick = () => new Promise((r) => setTimeout(r, 20));

describe("request timing log", () => {
  it("logs method, route PATTERN, status, duration and query count", async () => {
    const lines: string[] = [];
    await request(appWith(ON, lines)).get("/api/groups/123/tasks");
    await tick();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[timing\] GET \/api\/groups\/:id\/tasks 200 \d+ms q=2$/);
  });

  it("never prints the real id, the query string, headers, tokens or cookies", async () => {
    const lines: string[] = [];
    await request(appWith(ON, lines))
      .get("/api/groups/987654/tasks?token=SECRETQUERY&email=a@b.c")
      .set("Authorization", "Bearer SECRETBEARER")
      .set("Cookie", "ft_refresh=SECRETCOOKIE");
    await tick();
    const all = lines.join("\n");
    expect(all).not.toContain("987654");
    expect(all).not.toContain("SECRET");
    expect(all).not.toContain("a@b.c");
  });

  it("logs '(no route)' for an unmatched URL without printing the URL", async () => {
    const lines: string[] = [];
    await request(appWith(ON, lines)).get("/some/secret-path-4242");
    await tick();
    expect(lines[0]).toMatch(/^\[timing\] GET \(no route\) 404 /);
    expect(lines[0]).not.toContain("4242");
  });

  it("adds a route's own number, as digits only (login bcrypt)", async () => {
    const lines: string[] = [];
    await request(appWith(ON, lines)).post("/login-like").send({ email: "x@y.z", password: "pw" });
    await tick();
    expect(lines[0]).toMatch(/^\[timing\] POST \/login-like 401 \d+ms q=0 bcrypt=212ms$/);
    expect(lines[0]).not.toContain("x@y.z");
  });

  it("prints q=- when the client is not counting", async () => {
    const lines: string[] = [];
    await request(appWith(ON, lines, false)).get("/api/groups/1/tasks");
    await tick();
    expect(lines[0]).toMatch(/ q=-$/);
  });

  it("is off with REQUEST_TIMING_LOG=off and by default under NODE_ENV=test", async () => {
    const lines: string[] = [];
    await request(appWith({ ...ON, REQUEST_TIMING_LOG: "off" }, lines)).get("/api/groups/1/tasks");
    await request(appWith({ NODE_ENV: "test" } as NodeJS.ProcessEnv, lines)).get("/api/groups/1/tasks");
    await tick();
    expect(lines).toHaveLength(0);
    expect(isTimingEnabled({ NODE_ENV: "test", REQUEST_TIMING_LOG: "on" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isTimingEnabled({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("hides requests faster than REQUEST_TIMING_MIN_MS; the default 0 logs everything", async () => {
    const lines: string[] = [];
    await request(appWith({ ...ON, REQUEST_TIMING_MIN_MS: "60000" }, lines)).get("/api/groups/1/tasks");
    await tick();
    expect(lines).toHaveLength(0);
    await request(appWith(ON, lines)).get("/api/groups/1/tasks");
    await tick();
    expect(lines).toHaveLength(1);
  });

  it("marks requests over 2000 ms with [timing][slow], and not below", () => {
    const base = { method: "GET", pattern: "/x", status: 200, queries: 1, extraMs: {} };
    expect(SLOW_REQUEST_MS).toBe(2000);
    expect(formatTimingLine({ ...base, ms: 2001 })).toMatch(/^\[timing\]\[slow\] GET \/x 200 2001ms q=1$/);
    expect(formatTimingLine({ ...base, ms: 2000 })).toMatch(/^\[timing\] GET \/x 200 2000ms q=1$/);
  });

  it("routePattern uses the route definition, never the URL", () => {
    expect(routePattern({ route: undefined, baseUrl: "" } as never)).toBe("(no route)");
    expect(routePattern({ route: { path: "/:id/report" }, baseUrl: "/api/projects" } as never)).toBe("/api/projects/:id/report");
  });
});

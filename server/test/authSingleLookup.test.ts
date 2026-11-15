import { describe, it, expect, vi, afterEach } from "vitest";

vi.hoisted(() => { process.env.REQUEST_TIMING_LOG = "on"; });
import request from "supertest";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();
const EXPECTED_INSTRUCTOR_Q = 2; // one account lookup (shared by requireAuth and requireRole) + the classes query (was 3)
const INSTRUCTOR_ROUTE = "/api/classes"; // GET, requireRole("INSTRUCTOR"), no user lookup of its own

afterEach(() => vi.restoreAllMocks());

// Prisma operations for one request, read from the E1-0 timing line ("q=N"). The timing log and the counting
// client are switched on for this file only, before the client is created.
async function opsFor(fn: () => Promise<unknown>): Promise<number> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((l: unknown) => { lines.push(String(l)); });
  try {
    await fn();
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    spy.mockRestore();
  }
  const line = lines.find((l) => l.startsWith("[timing]"));
  const m = line?.match(/ q=(\d+)/);
  if (!m) throw new Error("no timing line: " + JSON.stringify(lines));
  return Number(m[1]);
}

describe("auth middleware: responses stay identical (characterisation)", () => {
  it("no token: 401 Authentication required", async () => {
    const res = await request(app).get(INSTRUCTOR_ROUTE);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Authentication required" });
  });

  it("invalid and expired tokens: the same 401", async () => {
    const bad = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", "Bearer not-a-token");
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: "Authentication required" });

    const expired = jwt.sign({ sub: 1, email: "x@y.z", name: "X", role: "INSTRUCTOR" }, process.env.AUTH_SECRET ?? "test-secret", { expiresIn: -60 });
    const res = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Authentication required" });
  });

  it("approved instructor: 200", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "APPROVED" });
    const res = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(200);
  });

  it("pending / rejected instructor: 403 with the same code and message", async () => {
    const { user: pending } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });
    const p = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", authHeaderFor(pending));
    expect(p.status).toBe(403);
    expect(p.body).toEqual({ error: "Your instructor account is waiting for admin approval.", code: "INSTRUCTOR_PENDING" });

    const { user: rejected } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "REJECTED" });
    const r = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", authHeaderFor(rejected));
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: "Your instructor request was not approved. Contact your administrator.", code: "INSTRUCTOR_REJECTED" });
  });

  it("deactivated instructor: 401 ACCOUNT_UNAVAILABLE on the very next request, and back to 200 when reactivated", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "APPROVED" });
    const auth = authHeaderFor(user);
    expect((await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", auth)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { active: false } });
    const off = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", auth);
    expect(off.status).toBe(401);
    expect(off.body).toEqual({ error: "Account no longer available", code: "ACCOUNT_UNAVAILABLE" });

    await prisma.user.update({ where: { id: user.id }, data: { active: true } });
    expect((await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", auth)).status).toBe(200);
  });

  it("a deleted (anonymised) account: 401 ACCOUNT_UNAVAILABLE", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "APPROVED" });
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });
    const res = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_UNAVAILABLE");
  });

  it("approval takes effect on the very next request with the same token", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "PENDING" });
    const auth = authHeaderFor(user);
    expect((await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", auth)).status).toBe(403);
    await prisma.user.update({ where: { id: user.id }, data: { instructorStatus: "APPROVED" } });
    expect((await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", auth)).status).toBe(200);
  });

  it("a student on an instructor route: 403 Insufficient permissions", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const res = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Insufficient permissions" });
  });

  it("a deactivated student on an instructor route is 401 (account check comes before the role check)", async () => {
    const { user } = await createUser({ systemRole: "STUDENT", active: false });
    const res = await request(app).get(INSTRUCTOR_ROUTE).set("Authorization", authHeaderFor(user));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_UNAVAILABLE");
  });
});

describe("auth middleware: Prisma operations per request (q= in the timing log)", () => {
  it("an approved instructor GET /api/classes", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR", instructorStatus: "APPROVED" });
    const q = await opsFor(() => request(app).get(INSTRUCTOR_ROUTE).set("Authorization", authHeaderFor(user)));
    expect(q).toBe(EXPECTED_INSTRUCTOR_Q);
  });

  it("a student GET /api/student/classes (one lookup in requireAuth, none extra)", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const q = await opsFor(() => request(app).get("/api/student/classes").set("Authorization", authHeaderFor(user)));
    expect(q).toBe(2); // requireAuth lookup + the route query
  });
});

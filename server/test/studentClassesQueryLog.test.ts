// E1d-1: the student class lists must not read every report of every group. Logs the real SQL
// (a query-event PrismaClient replaces the shared one for this file only) and checks the Report read.
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../src/lib/prisma.js", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  const g = globalThis as unknown as { __sqlLog: string[] };
  g.__sqlLog = [];
  // @ts-expect-error event typing of $on with an emit:"event" log
  client.$on("query", (e: { query: string }) => g.__sqlLog.push(e.query.replace(/\s+/g, " ")));
  return { prisma: client };
});

import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();
const log = () => (globalThis as unknown as { __sqlLog: string[] }).__sqlLog;

describe("student class lists: Report reads", () => {
  it("read one report row per own group (DISTINCT ON), never the whole history, and still return the latest", async () => {
    const { user: inst } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: s } = await createUser({ systemRole: "STUDENT" });
    const cs = await createClassSection(inst.id);
    await prisma.classEnrollment.create({ data: { userId: s.id, classSectionId: cs.id } });
    const a = await createAssignment(cs.id);
    const mine = await createProject({ assignmentId: a.id, groupName: "Mine" });
    const other = await createProject({ assignmentId: a.id, groupName: "Other" });
    await createMembership(s.id, mine.id, "MEMBER");
    for (let i = 0; i < 4; i++) {
      await prisma.report.create({ data: { projectId: mine.id, teamHealth: i === 3 ? "Healthy" : "High Risk", generatedAt: new Date(Date.UTC(2026, 10, 1 + i)) } });
      await prisma.report.create({ data: { projectId: other.id, teamHealth: "High Risk", generatedAt: new Date(Date.UTC(2026, 10, 1 + i)) } });
    }

    for (const url of ["/api/student/classes", `/api/student/classes/${cs.id}/projects`]) {
      log().length = 0;
      const res = await request(app).get(url).set("Authorization", authHeaderFor(s));
      expect(res.status).toBe(200);
      const reportReads = log().filter((q) => /FROM "(public"\."Report|Report)"/.test(q));
      expect(reportReads).toHaveLength(1);
      expect(reportReads[0]).toContain("DISTINCT ON");
      // Another group's reports are not even asked for.
      expect(reportReads[0]).toContain('"GroupMembership"');
      const mineBody = JSON.stringify(res.body);
      expect(mineBody).toContain('"evenness":"even"');
      expect(mineBody).not.toContain('"evenness":"very-uneven"');
    }
  });
});

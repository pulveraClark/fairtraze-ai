import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { generateReportId } from "../src/lib/reportId.js";
import { REPORT_ID_PATTERN } from "@shared/evidenceReport.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

import { saveReport, setup } from "./helpers/evidenceFixtures.js";

const get = (projectId: number, user: Parameters<typeof authHeaderFor>[0]) =>
  request(app).get(`/api/groups/${projectId}/evidence-report`).set("Authorization", authHeaderFor(user));

const ALLOWED_TOP = [
  "collegeName", "groupName", "className", "projectTitle", "repoUrl", "analyzedAt", "generatedAt",
  "sourceType", "weights", "memberCount", "equalSharePct", "members", "leaderName", "reportId",
].sort();
const ALLOWED_MEMBER = ["name", "githubPct", "docsPct", "combinedPct", "flags"].sort();

describe("GET /api/groups/:id/evidence-report", () => {
  it("a plain member reads their own group's report, including teammates' shares and real flag names", async () => {
    const { project, member } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    const res = await get(project.id, member);
    expect(res.status).toBe(200);
    expect(res.body.groupName).toBe("Group Evidence");
    expect(res.body.leaderName).toBe("Lena Leader");
    expect(res.body.memberCount).toBe(2);
    expect(res.body.equalSharePct).toBe(50);
    expect(res.body.members).toEqual([
      { name: "Alice", githubPct: 60, docsPct: null, combinedPct: 60, flags: ["overload"] },
      { name: "Bob", githubPct: 40, docsPct: null, combinedPct: 40, flags: [] },
    ]);
    expect(res.body.weights).toBeNull();
    expect(res.body.reportId).toMatch(REPORT_ID_PATTERN);
  });

  it("the owning instructor can read it; a non-member student, another instructor, an admin and a visitor cannot", async () => {
    const { project, instructor } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    expect((await get(project.id, instructor)).status).toBe(200);

    const { user: outsider } = await createUser({ systemRole: "STUDENT" });
    expect((await get(project.id, outsider)).status).toBe(403);

    const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
    expect((await get(project.id, otherInstructor)).status).toBe(403);

    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    expect((await get(project.id, admin)).status).toBe(403);

    const anon = await request(app).get(`/api/groups/${project.id}/evidence-report`);
    expect(anon.status).toBe(401);
  });

  it("answers 404 NO_ANALYSIS when the group has not been analyzed", async () => {
    const { project, member } = await setup("GITHUB");
    const res = await get(project.id, member);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NO_ANALYSIS");
  });

  it("returns only whitelisted fields: no Gini, bands, team health, thresholds, AI text, usernames, emails, counts or ids", async () => {
    const { project, member } = await setup("COMBINED");
    await saveReport(project.id, "COMBINED");
    const res = await get(project.id, member);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(ALLOWED_TOP);
    for (const m of res.body.members) expect(Object.keys(m).sort()).toEqual(ALLOWED_MEMBER);

    const text = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of [
      "gini", "teamhealth", "high risk", "band", "threshold", "narrative", "ai text should never",
      "secret-gh", "commits", "additions", "deletions", "@", "userid", "0.987", "1.75",
    ]) {
      expect(text, `leaked: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("shows the columns that apply: GitHub only, Documents only, or both with the stored blend", async () => {
    const gh = await setup("GITHUB");
    await saveReport(gh.project.id, "GITHUB");
    const a = (await get(gh.project.id, gh.member)).body;
    expect(a.members[0].githubPct).toBe(60);
    expect(a.members[0].docsPct).toBeNull();

    const ed = await setup("EDITOR");
    await saveReport(ed.project.id, "EDITOR");
    const b = (await get(ed.project.id, ed.member)).body;
    expect(b.members[0].githubPct).toBeNull();
    expect(b.members[0].docsPct).toBe(60);
    expect(b.repoUrl).toBeNull();

    const co = await setup("COMBINED");
    await saveReport(co.project.id, "COMBINED");
    const c = (await get(co.project.id, co.member)).body;
    expect(c.members[0]).toMatchObject({ githubPct: 70, docsPct: 50, combinedPct: 60 });
    // The blend that produced the numbers (stored with the report: 40/60), not the live default.
    expect(c.weights).toEqual({ githubPct: 40, docsPct: 60 });
  });
});

describe("Report ID", () => {
  it("has the FT-XXXX-XX format and is not a sequence", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = generateReportId();
      expect(id).toMatch(REPORT_ID_PATTERN);
      seen.add(id);
    }
    expect(seen.size).toBeGreaterThan(495);
  });

  it("is made once per analysis, reused for everyone who opens it, and new after a new analysis", async () => {
    const { project, member, leader, instructor } = await setup("GITHUB");
    const first = await saveReport(project.id, "GITHUB");
    const a = (await get(project.id, member)).body.reportId;
    const b = (await get(project.id, member)).body.reportId;
    const c = (await get(project.id, leader)).body.reportId;
    const d = (await get(project.id, instructor)).body.reportId;
    expect(new Set([a, b, c, d]).size).toBe(1);

    const row = await prisma.reportEvidenceId.findUnique({ where: { reportId: first.id } });
    expect(row?.code).toBe(a);
    expect(row?.projectId).toBe(project.id);

    await saveReport(project.id, "GITHUB");
    const e = (await get(project.id, member)).body.reportId;
    expect(e).not.toBe(a);
    expect(await prisma.reportEvidenceId.count({ where: { projectId: project.id } })).toBe(2);
  });

  it("concurrent first opens end up with one ID", async () => {
    const { project, member, leader } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    const results = await Promise.all([get(project.id, member), get(project.id, leader), get(project.id, member)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(new Set(results.map((r) => r.body.reportId)).size).toBe(1);
  });

  it("IDs of different analyses are all different", async () => {
    const { project, member } = await setup("GITHUB");
    const ids = new Set<string>();
    for (let i = 0; i < 6; i++) {
      await saveReport(project.id, "GITHUB");
      ids.add((await get(project.id, member)).body.reportId);
    }
    expect(ids.size).toBe(6);
  });
});

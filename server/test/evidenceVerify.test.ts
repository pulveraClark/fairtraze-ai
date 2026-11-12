import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { generateReportId } from "../src/lib/reportId.js";
import { createUser, authHeaderFor } from "./factories.js";
import { saveReport, setup } from "./helpers/evidenceFixtures.js";

const app = createApp();

type U = Parameters<typeof authHeaderFor>[0];
const idOf = async (projectId: number, user: U) =>
  (await request(app).get(`/api/groups/${projectId}/evidence-report`).set("Authorization", authHeaderFor(user))).body.reportId as string;
const verify = (user: U, code: unknown) =>
  request(app).post("/api/evidence-reports/verify").set("Authorization", authHeaderFor(user)).send({ code });

describe("POST /api/evidence-reports/verify", () => {
  it("the owning instructor sees the printout's numbers and 'latest' for the newest analysis, with no Gini or bands", async () => {
    const { project, member, instructor } = await setup("COMBINED");
    await saveReport(project.id, "COMBINED");
    const code = await idOf(project.id, member);

    const res = await verify(instructor, code);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("latest");
    expect(res.body.groupName).toBe("Group Evidence");
    expect(res.body.members[0]).toMatchObject({ name: "Alice", githubPct: 70, docsPct: 50, combinedPct: 60, flags: ["overload"] });
    expect(res.body.weights).toEqual({ githubPct: 40, docsPct: 60 });
    expect(Object.keys(res.body).sort()).toEqual(
      ["analyzedAt", "groupName", "members", "projectTitle", "sourceType", "status", "weights"],
    );
    const text = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ["gini", "teamhealth", "high risk", "band", "threshold", "narrative", "secret-gh", "commits", "@", "0.987"]) {
      expect(text, `leaked: ${forbidden}`).not.toContain(forbidden);
    }

    // The numbers equal what the student's printout shows for that same analysis.
    const printout = await request(app).get(`/api/groups/${project.id}/evidence-report`).set("Authorization", authHeaderFor(member));
    expect(res.body.members).toEqual(printout.body.members);
  });

  it("accepts the code typed in lower case or without dashes", async () => {
    const { project, member, instructor } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    const code = await idOf(project.id, member);
    expect((await verify(instructor, code.toLowerCase())).status).toBe(200);
    expect((await verify(instructor, `  ${code.replace(/-/g, " ")} `)).status).toBe(200);
  });

  it("after a re-analysis the old ID still works and says 'older'; the new ID says 'latest'", async () => {
    const { project, member, instructor } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    const oldCode = await idOf(project.id, member);
    await saveReport(project.id, "GITHUB");
    await saveReport(project.id, "GITHUB");
    const newCode = await idOf(project.id, member);

    const old = await verify(instructor, oldCode);
    expect(old.status).toBe(200);
    expect(old.body.status).toBe("older");
    expect((await verify(instructor, newCode)).body.status).toBe("latest");
  });

  it("an unknown code, a malformed code and another instructor's code all give the same 404 'Report ID not found.'", async () => {
    const { project, member } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    const code = await idOf(project.id, member);
    const { user: other } = await createUser({ systemRole: "INSTRUCTOR" });

    const unknown = await verify(other, generateReportId());
    const malformed = await verify(other, "hello");
    const missing = await request(app).post("/api/evidence-reports/verify").set("Authorization", authHeaderFor(other)).send({});
    const foreign = await verify(other, code);
    for (const r of [unknown, malformed, missing, foreign]) {
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: "Report ID not found." });
    }
  });

  it("students, admins and visitors cannot verify", async () => {
    const { project, member, instructor } = await setup("GITHUB");
    await saveReport(project.id, "GITHUB");
    const code = await idOf(project.id, member);
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    expect((await verify(member, code)).status).toBe(403);
    expect((await verify(admin, code)).status).toBe(403);
    expect((await request(app).post("/api/evidence-reports/verify").send({ code })).status).toBe(401);
    expect((await verify(instructor, code)).status).toBe(200);
  });
});

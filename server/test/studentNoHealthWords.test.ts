import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";
import { studentNarrative, stripTeamMeasures, isTeamMeasureSentence } from "../src/lib/studentNarrative.js";
import { shapeSummariesForViewer } from "../src/routes/aiReview.js";
import type { AiMemberSummariesContent } from "@shared/aiReviewTypes.js";

const app = createApp();
const GINI = 0.31377;

// Nothing a student or a group leader receives may contain any of these.
// ("Healthy" is the capitalised label; ordinary lower-case "a healthy mix of tasks" is harmless prose.)
const FORBIDDEN = [/gini/i, /\bHealthy\b/, /moderate risk/i, /high risk/i, /team health/i, /0\.3137/];

const STORED_NARRATIVE = [
  "Group One has a team health of Healthy.",
  "The Gini coefficient is 0.314, which shows moderate concentration.",
  "Alice made most of the commits and wrote the API.",
  "Bob wrote a healthy mix of tasks and documentation.",
].join(" ");

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  for (const [u, role] of [[leader, "LEADER"], [member, "MEMBER"]] as const) {
    await createMembership(u.id, project.id, role);
    await prisma.classEnrollment.create({ data: { userId: u.id, classSectionId: cls.id } });
  }
  const report = { members: [], memberCount: 2, gini: GINI, teamHealth: "Moderate Risk" };
  await prisma.report.create({
    data: { projectId: project.id, gini: GINI, teamHealth: "Moderate Risk", content: JSON.stringify({ report, narrative: STORED_NARRATIVE }) },
  });
  return { cls, project, leader, member, instructor };
}

describe("student and leader responses carry no health label, band or Gini", () => {
  it("group page, class lists and data export, for a member and a leader, even with old stored AI text", async () => {
    const s = await setup();
    for (const user of [s.member, s.leader]) {
      const auth = { Authorization: authHeaderFor(user) };
      const paths = ["/api/student/classes", `/api/student/classes/${s.cls.id}/projects`, `/api/student/group/${s.project.id}`, "/api/privacy/export"];
      for (const path of paths) {
        const res = await request(app).get(path).set(auth);
        expect(res.status, path).toBe(200);
        const body = JSON.stringify(res.body);
        for (const bad of FORBIDDEN) expect(body, `${path} ${bad}`).not.toMatch(bad);
      }
    }
  });

  it("the plain evenness word is still sent, and the leader keeps the harmless sentences", async () => {
    const s = await setup();
    const res = await request(app).get(`/api/student/group/${s.project.id}`).set("Authorization", authHeaderFor(s.leader));
    expect(res.body.report.evenness).toBe("a-bit-uneven");
    expect(res.body.report).not.toHaveProperty("teamHealth");
    expect(res.body.report.narrative).toContain("Alice made most of the commits");
    // Lower-case "healthy" in ordinary prose is not a health label and is kept.
    expect(res.body.report.narrative).toContain("a healthy mix of tasks");
  });

  it("the instructor still gets the full label and text", async () => {
    const s = await setup();
    const res = await request(app).get(`/api/projects/${s.project.id}/report`).set("Authorization", authHeaderFor(s.instructor));
    expect(res.status).toBe(200);
    expect(res.body.report.teamHealth).toBe("Moderate Risk");
    expect(res.body.narrative).toContain("team health of Healthy");
  });
});

describe("read-time filtering of stored AI text", () => {
  it("drops the sentences that state the label or Gini and keeps the rest", () => {
    const out = studentNarrative(STORED_NARRATIVE)!;
    for (const bad of FORBIDDEN) expect(out).not.toMatch(bad);
    expect(out).toContain("Alice made most of the commits");
    expect(out).toContain("a healthy mix of tasks");
  });

  it("member summaries are cleaned for a member and a leader, never for the instructor", () => {
    const content = {
      members: [{
        userId: 7, summary: "Worked on the login page. The team health is Healthy. Fixed two bugs.", source: "ai",
        evidence: { files: [], docSections: [] },
      }],
      aiAddressed: [],
    } as unknown as AiMemberSummariesContent;
    const people = new Map([[7, { name: "Ana", githubUsername: null }]]);
    for (const viewer of ["member", "leader"] as const) {
      const out = shapeSummariesForViewer(content, viewer, 7, people).summaries[0]!;
      expect(out.summary).toBe("Worked on the login page. Fixed two bugs.");
    }
    expect(shapeSummariesForViewer(content, "instructor", 9, people).summaries[0]!.summary).toContain("team health");
  });

  it("documents what the filter can drop by mistake (false positives) and what it keeps", () => {
    // Kept: ordinary lower-case wording.
    for (const ok of ["Bob wrote a healthy mix of tasks.", "The health check endpoint was added.", "Tests run in a healthy pipeline."]) {
      expect(isTeamMeasureSentence(ok), ok).toBe(false);
    }
    // Dropped on purpose.
    for (const bad of ["The team health is Healthy.", "The group is rated as Healthy.", "A Moderate Risk group.", "The Gini coefficient is 0.2."]) {
      expect(isTeamMeasureSentence(bad), bad).toBe(true);
    }
    // Dropped by mistake: a sentence about project risk, a decimal such as a version number, a capitalised
    // "Healthy" next to "team", and any use of "concentration"/"coefficient"/"inequality".
    for (const wrong of [
      "Merge conflicts are a high risk for this repository.",
      "Upgraded the library to version 2.1.",
      "The Healthy Eating team page was built by Ana.",
      "She worked on the lens concentration setting.",
    ]) {
      expect(isTeamMeasureSentence(wrong), wrong).toBe(true);
    }
    expect(stripTeamMeasures("Nothing to remove here.")).toBe("Nothing to remove here.");
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject } from "./factories.js";

const app = createApp();

describe("GET /api/projects/summary — real class and assignment names for breadcrumbs", () => {
  it("returns the class code, class subject name and assignment title, whatever assignmentLabel says", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cls = await createClassSection(instructor.id, { subjectCode: "UXA-101" });
    const assignment = await createAssignment(cls.id, { title: "Capstone Proposal" });
    const group = await createProject({ assignmentId: assignment.id, groupName: "Group Alpha" }); // assignmentLabel left empty

    const res = await request(app).get("/api/projects/summary").set("Authorization", authHeaderFor(instructor));
    expect(res.status).toBe(200);
    const item = (res.body.summary as { projectId: number; classCode?: string; classSubjectName?: string; assignmentTitle?: string }[])
      .find((s) => s.projectId === group.id);
    expect(item).toMatchObject({ classCode: "UXA-101", classSubjectName: "Test Subject", assignmentTitle: "Capstone Proposal" });
  });
});

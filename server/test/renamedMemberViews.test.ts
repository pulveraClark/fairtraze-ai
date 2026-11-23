import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { runAnalysis, silentProgress } from "../src/lib/analysisRunner.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

describe("a changed full name shows in the report views", () => {
  // INT-039
  it("leader's team view shows the new name at once; the instructor's report shows it after the next analysis", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const cs = await createClassSection(instructor.id);
    const asg = await createAssignment(cs.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: asg.id, repoUrl: null });
    const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Old Leader Name" });
    const { user: member } = await createUser({ systemRole: "STUDENT", name: "Teammate Tan" });
    await createMembership(leader.id, project.id, "LEADER");
    await createMembership(member.id, project.id);

    const analyze = () => runAnalysis(project.id, { progress: silentProgress, actorInstructorId: null, trigger: "manual" });
    const teamNames = async () => {
      const res = await request(app).get(`/api/student/group/${project.id}`).set("Authorization", authHeaderFor(leader));
      expect(res.status).toBe(200);
      return (res.body.report.team as Array<{ name: string }>).map((m) => m.name);
    };
    const instructorNames = async () => {
      const res = await request(app).get(`/api/projects/${project.id}/report`).set("Authorization", authHeaderFor(instructor));
      expect(res.status).toBe(200);
      return (res.body.report.members as Array<{ studentName: string }>).map((m) => m.studentName);
    };

    expect((await analyze()).status).toBe(200);
    expect(await teamNames()).toContain("Old Leader Name");
    expect(await instructorNames()).toContain("Old Leader Name");

    // The student changes their full name in Settings.
    const patch = await request(app).patch("/api/users/me").set("Authorization", authHeaderFor(leader)).send({ name: "New Leader Name" });
    expect(patch.status).toBe(200);

    // The leader's team view reads the live account name: changed immediately, teammate untouched.
    const live = await teamNames();
    expect(live).toContain("New Leader Name");
    expect(live).not.toContain("Old Leader Name");
    expect(live).toContain("Teammate Tan");

    // The instructor's report shows the current name too: names are swapped in by member id at display time
    // (the stored Report.content keeps its own snapshot until the next analysis refreshes it).
    const instructorLive = await instructorNames();
    expect(instructorLive).toContain("New Leader Name");
    expect(instructorLive).not.toContain("Old Leader Name");

    expect((await analyze()).status).toBe(200);
    const after = await instructorNames();
    expect(after).toContain("New Leader Name");
    expect(after).not.toContain("Old Leader Name");
    expect(after).toContain("Teammate Tan");
    expect(await teamNames()).toContain("New Leader Name");
  });
});

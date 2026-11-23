import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { anonymizeUser } from "../src/lib/anonymizeUser.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();
const PIC = Buffer.from("not-really-a-png-but-bytes");

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id);
  const project = await createProject({ assignmentId: asg.id });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lea Leader" });
  // The person marked this as the group's leader; leadership has since moved on (an account that is the only leader cannot be erased).
  const { user: newLeader } = await createUser({ systemRole: "STUDENT" });
  await createMembership(newLeader.id, project.id, "LEADER");
  await createMembership(leader.id, project.id, "MEMBER");
  const mark = (markedById: number, key: string, role: "LEADER" | "INSTRUCTOR") => prisma.requirementMark.create({
    data: {
      projectId: project.id, requirementKey: key, requirementText: "Write system documentation.", sourceQuote: "write its system documentation",
      role, status: role === "LEADER" ? "LEADER_CLAIM" : "INSTRUCTOR_CONFIRMED", markedById,
      note: role === "LEADER" ? "In the User Guide" : "Checked the repo", imageData: Uint8Array.from(PIC), imageMime: "image/png",
    },
  });
  const mine = await mark(leader.id, "a".repeat(32), "LEADER");
  const theirs = await mark(instructor.id, "a".repeat(32), "INSTRUCTOR");
  return { instructor, admin, leader, project, mine, theirs };
}

describe("marks and the personal data export", () => {
  it("lists the person's own marks with the note and whether there was a picture, never the picture's bytes or anyone else's mark", async () => {
    const s = await setup();
    const res = await request(app).get("/api/privacy/export").set("Authorization", authHeaderFor(s.leader));
    expect(res.status).toBe(200);
    expect(res.body.requirementMarks).toHaveLength(1);
    expect(res.body.requirementMarks[0]).toMatchObject({ projectId: s.project.id, role: "LEADER", note: "In the User Guide", hadPicture: true });
    expect(Object.keys(res.body.requirementMarks[0])).not.toContain("imageData");
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("Checked the repo");
    expect(text).not.toContain(PIC.toString("base64"));
    expect(text).not.toContain(PIC.toString("utf8"));
  });
});

describe("marks and account erasure", () => {
  it("removes the person's note and picture; the mark itself and everyone else's marks stay", async () => {
    const s = await setup();
    expect(await anonymizeUser(s.leader.id, { actorId: s.admin.id, actorName: "Admin", action: "USER_ANONYMIZED" })).toEqual({ ok: true });
    const mine = await prisma.requirementMark.findUniqueOrThrow({ where: { id: s.mine.id } });
    expect(mine).toMatchObject({ note: null, imageData: null, imageMime: null, status: "LEADER_CLAIM" });
    const theirs = await prisma.requirementMark.findUniqueOrThrow({ where: { id: s.theirs.id } });
    expect(theirs.note).toBe("Checked the repo");
    expect(theirs.imageData).not.toBeNull();
  });
});

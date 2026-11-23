import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { notifyProjectChanged } from "../src/lib/projectChangeNotice.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>("../src/middleware/security.js");
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const app = createApp();

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50, 2)]);

type U = Awaited<ReturnType<typeof createUser>>["user"];

/** Instructor, one project with two groups; group 1 has a leader and a member, group 2 has one member. */
async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: other } = await createUser({ systemRole: "STUDENT" });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: "COMBINED", title: "Sprint 1" });
  const g1 = await createProject({ assignmentId: assignment.id, groupName: "Group 1" });
  const g2 = await createProject({ assignmentId: assignment.id, groupName: "Group 2" });
  await createMembership(leader.id, g1.id, "LEADER");
  await createMembership(member.id, g1.id, "MEMBER");
  await createMembership(other.id, g2.id, "LEADER");
  // A different project that must never be touched.
  const asg2 = await createAssignment(classSection.id, { title: "Elsewhere" });
  const g3 = await createProject({ assignmentId: asg2.id, groupName: "Group 3" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  await createMembership(outsider.id, g3.id, "LEADER");
  return { instructor, leader, member, other, outsider, assignment, g1, g2, g3 };
}

const patch = (instructor: U, id: number, body: object) =>
  request(app).patch(`/api/assignments/${id}`).set("Authorization", authHeaderFor(instructor)).send(body);

const notices = () => prisma.alert.findMany({ where: { type: "PROJECT_UPDATED" }, orderBy: { id: "asc" } });

describe("project change notices", () => {
  it("a save that changes nothing makes no notice", async () => {
    const { instructor, assignment } = await setup();
    const same = await patch(instructor, assignment.id, {
      title: assignment.title,
      maxGroupSize: assignment.maxGroupSize,
      ...(assignment.deadline ? { deadline: assignment.deadline.toISOString() } : {}),
    });
    expect(same.status).toBe(200);
    expect(await notices()).toHaveLength(0);
  });

  it("a rename notifies the members of every group in that project, and nobody else", async () => {
    const { instructor, leader, member, other, outsider, assignment, g1, g2 } = await setup();
    const res = await patch(instructor, assignment.id, { title: "Sprint 2" });
    expect(res.status).toBe(200);

    const rows = await notices();
    expect(rows.map((r) => r.recipientId).sort()).toEqual([leader.id, member.id, other.id].sort());
    expect(rows.map((r) => r.recipientId)).not.toContain(instructor.id);
    expect(rows.map((r) => r.recipientId)).not.toContain(outsider.id);
    const mine = rows.find((r) => r.recipientId === member.id)!;
    expect(mine).toMatchObject({ projectId: g1.id, link: `/student/group/${g1.id}`, read: false });
    expect(mine.message).toBe("The project was renamed to “Sprint 2”.");
    expect(rows.find((r) => r.recipientId === other.id)!.projectId).toBe(g2.id);
  });

  it("each edited field produces its own plain notice", async () => {
    const { instructor, member, assignment } = await setup();
    const one = async (body: object) => {
      await prisma.alert.deleteMany({});
      expect((await patch(instructor, assignment.id, body)).status).toBe(200);
      return (await prisma.alert.findFirst({ where: { recipientId: member.id, type: "PROJECT_UPDATED" } }))?.message;
    };
    expect(await one({ description: "New instructions text." })).toBe("Your instructor updated the project instructions.");
    expect(await one({ maxGroupSize: 6 })).toBe("The group size limit is now 6.");
    expect(await one({ deadline: "2031-03-04T09:00:00.000Z" })).toBe("The deadline changed. It is now Mar 4, 2031, 5:00 PM.");
  });

  it("two saves 2 minutes apart give one notice with merged text; one 11 minutes later gives a second", async () => {
    const { instructor, member, assignment } = await setup();
    await patch(instructor, assignment.id, { maxGroupSize: 6 });
    const first = (await prisma.alert.findFirst({ where: { recipientId: member.id, type: "PROJECT_UPDATED" } }))!;
    await prisma.alert.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 2 * 60_000), read: true } });

    await patch(instructor, assignment.id, { title: "Sprint 3" });
    let mine = await prisma.alert.findMany({ where: { recipientId: member.id, type: "PROJECT_UPDATED" } });
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(first.id);
    expect(mine[0]!.message).toBe("Your instructor made 2 changes to the project: name, group size limit. Open your group to see them.");
    expect(mine[0]!.read).toBe(false); // read before, changed again, so it is unread again

    await prisma.alert.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
    await patch(instructor, assignment.id, { maxGroupSize: 7 });
    mine = await prisma.alert.findMany({ where: { recipientId: member.id, type: "PROJECT_UPDATED" }, orderBy: { id: "asc" } });
    expect(mine).toHaveLength(2);
    expect(mine[1]!.message).toBe("The group size limit is now 7.");
  });

  it("attachment upload and delete notify; reordering does not", async () => {
    const { instructor, member, assignment } = await setup();
    const auth = authHeaderFor(instructor);
    const up = (name: string) =>
      request(app).post(`/api/assignments/${assignment.id}/attachments?filename=${name}`).set("Authorization", auth).set("Content-Type", "image/png").send(PNG);

    const a = await up("a.png");
    const b = await up("b.png");
    expect(a.status).toBe(201);
    const afterUpload = await prisma.alert.findMany({ where: { recipientId: member.id, type: "PROJECT_UPDATED" } });
    expect(afterUpload).toHaveLength(1);
    expect(afterUpload[0]!.message).toBe("Your instructor changed the files attached to the instructions.");

    await prisma.alert.deleteMany({});
    const order = await request(app).put(`/api/assignments/${assignment.id}/attachments/order`).set("Authorization", auth).send({ ids: [b.body.id, a.body.id] });
    expect(order.status).toBe(200);
    expect(await notices()).toHaveLength(0);

    const del = await request(app).delete(`/api/assignments/${assignment.id}/attachments/${a.body.id}`).set("Authorization", auth);
    expect(del.status).toBe(200);
    expect(await prisma.alert.count({ where: { recipientId: member.id, type: "PROJECT_UPDATED" } })).toBe(1);

    // Deleting something that is not there changes nothing and says nothing.
    await prisma.alert.deleteMany({});
    expect((await request(app).delete(`/api/assignments/${assignment.id}/attachments/999999`).set("Authorization", auth)).status).toBe(404);
    expect(await notices()).toHaveLength(0);
  });

  it("a scoring change sends a generic notice with no numbers; saving the same values sends nothing", async () => {
    const { instructor, member, assignment } = await setup();
    const body = {
      weights: { commits: 0.5, lines: 0.3, activeDays: 0.2 },
      thresholds: { freeRider: 0.4, overload: 2, deadlineDriven: 0.7 },
      blend: { wGitHub: 0.6, wDocs: 0.4 },
      docsWeights: { retainedText: 0.5, sessions: 0.25, activeDays: 0.25 },
    };
    const save = () => request(app).patch(`/api/assignments/${assignment.id}/scoring-config`).set("Authorization", authHeaderFor(instructor)).send(body);

    expect((await save()).status).toBe(200);
    const rows = await prisma.alert.findMany({ where: { recipientId: member.id, type: "PROJECT_UPDATED" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toBe("Your instructor updated the scoring settings. Reports update the next time they are analyzed.");
    expect(rows[0]!.message).not.toMatch(/\d|gini|threshold|weight|band|health/i);

    await prisma.alert.deleteMany({});
    expect((await save()).status).toBe(200); // identical values: no write, no notice
    expect(await notices()).toHaveLength(0);
  });

  it("a member who left the group gets no notice", async () => {
    const { instructor, leader, member, assignment, g1 } = await setup();
    await prisma.groupMembership.delete({ where: { userId_projectId: { userId: member.id, projectId: g1.id } } });
    await patch(instructor, assignment.id, { title: "Sprint 4" });
    const ids = (await notices()).map((r) => r.recipientId);
    expect(ids).toContain(leader.id);
    expect(ids).not.toContain(member.id);
  });

  it("deactivated and erased accounts get no notice", async () => {
    const { instructor, leader, member, assignment } = await setup();
    await prisma.user.update({ where: { id: leader.id }, data: { active: false } });
    await prisma.user.update({ where: { id: member.id }, data: { deletedAt: new Date() } });
    await patch(instructor, assignment.id, { title: "Sprint 5" });
    const ids = (await notices()).map((r) => r.recipientId);
    expect(ids).not.toContain(leader.id);
    expect(ids).not.toContain(member.id);
  });

  it("a pending join request gets no notice", async () => {
    const { instructor, assignment, g1 } = await setup();
    const { user: requester } = await createUser({ systemRole: "STUDENT" });
    await prisma.groupJoinRequest.create({ data: { userId: requester.id, projectId: g1.id } });
    await patch(instructor, assignment.id, { title: "Sprint 6" });
    expect((await notices()).map((r) => r.recipientId)).not.toContain(requester.id);
  });

  it("a failing notice never fails the save", async () => {
    const { instructor, assignment } = await setup();
    const spy = vi.spyOn(prisma.project, "findMany").mockRejectedValueOnce(new Error("boom"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await patch(instructor, assignment.id, { title: "Sprint 7" });
    spy.mockRestore();
    quiet.mockRestore();
    // The route's own findMany (group size check) is not used for a title-only save, so the mocked
    // failure lands inside the notice helper, which swallows it.
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Sprint 7");
    await expect(notifyProjectChanged(assignment.id, [])).resolves.toBeUndefined();
  });
});

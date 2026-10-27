import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { requirementKey, requirementKeys, isMarkStale } from "../src/lib/requirementMarks.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();

const BRIEF = "Build a login page. Students write a survey report.";
const Q_LOGIN = "Build a login page.";
const Q_SURVEY = "Students write a survey report.";
// A real 1x1 PNG (magic bytes are what the server sniffs).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: otherInstructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: admin } = await createUser({ systemRole: "ADMIN" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", name: "Lea Leader" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const cls = await createClassSection(instructor.id);
  const asg = await createAssignment(cls.id);
  await prisma.assignment.update({ where: { id: asg.id }, data: { description: BRIEF } });
  const project = await createProject({ assignmentId: asg.id });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  const report = await prisma.report.create({ data: { projectId: project.id, teamHealth: "Healthy", content: JSON.stringify({}) } });
  const review = (requirements: object[]) => prisma.aiReportReview.upsert({
    where: { reportId_kind: { reportId: report.id, kind: "BRIEF_COMPARISON" } },
    create: { reportId: report.id, kind: "BRIEF_COMPARISON", status: "OK", promptVersion: "x", model: "m", content: { requirements, aiAddressedCount: 0 } as never },
    update: { content: { requirements, aiAddressedCount: 0 } as never },
  });
  await review([
    { text: "Has a login page.", status: "NOT_FOUND", evidence: [], unverified: true, sourceQuote: Q_LOGIN },
    { text: "Write a survey report.", status: "FOUND", evidence: [], sourceQuote: Q_SURVEY },
  ]);
  const base = `/api/groups/${project.id}/requirement-marks`;
  const as = (u: { id: number; email: string; name: string; systemRole: never }) => ({ Authorization: authHeaderFor(u) });
  return { instructor, otherInstructor, admin, leader, member, outsider, project, asg, review, base, as: as as (u: unknown) => { Authorization: string } };
}

describe("requirement key", () => {
  it("comes from the verified source, not the AI's wording, so a reworded requirement keeps its mark", () => {
    const a = requirementKey({ sourceQuote: "Build a login page." });
    const b = requirementKey({ sourceQuote: "  build   a LOGIN page " });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(requirementKey({ sourceQuote: Q_SURVEY })).not.toBe(a);
    expect(requirementKey({ sourceFile: "Brief.pdf", sourcePage: 2 })).toBe(requirementKey({ sourceFile: "brief.pdf", sourcePage: 2 }));
    expect(requirementKey({ sourceFile: "brief.pdf", sourcePage: 3 })).not.toBe(requirementKey({ sourceFile: "brief.pdf", sourcePage: 2 }));
    expect(requirementKey({})).toBeNull();
  });

  it("siblings on one sentence get keys from the sentence plus their own text; a lone requirement keeps the old key", () => {
    const Q = "Build a planner with a GUI and write its documentation.";
    const gui = { text: "Use a GUI.", sourceQuote: Q };
    const docs = { text: "Write system documentation.", sourceQuote: Q };
    const lone = { text: "Has a login page.", sourceQuote: Q_LOGIN };
    const [kGui, kDocs, kLone] = requirementKeys([gui, docs, lone]);
    expect(kGui).not.toBe(kDocs);
    expect(kGui).not.toBe(requirementKey({ sourceQuote: Q }));
    expect(kLone).toBe(requirementKey({ sourceQuote: Q_LOGIN }));
    // Swapping the order keeps each key with its own text.
    const [kDocs2, kLone2, kGui2] = requirementKeys([docs, lone, gui]);
    expect([kDocs2, kGui2, kLone2]).toEqual([kDocs, kGui, kLone]);
    // A reworded sibling gets another key, so its old key matches nothing.
    const [, reworded] = requirementKeys([gui, { ...docs, text: "Provide a manual." }]);
    expect(reworded).not.toBe(kDocs);
  });

  it("a mark is stale only when its sentence (or file) is gone from the current instructions", () => {
    const cur = { description: BRIEF, attachmentNames: ["brief.pdf"] };
    expect(isMarkStale({ sourceQuote: Q_LOGIN }, cur)).toBe(false);
    expect(isMarkStale({ sourceQuote: Q_LOGIN }, { ...cur, description: "Build a sign-in page." })).toBe(true);
    expect(isMarkStale({ sourceFile: "Brief.pdf" }, cur)).toBe(false);
    expect(isMarkStale({ sourceFile: "brief.pdf" }, { ...cur, attachmentNames: [] })).toBe(true);
  });
});

describe("requirement marks: claim, confirm, decline", () => {
  it("only the leader of that group can claim, only on an item the AI could not confirm", async () => {
    const s = await setup();
    const key = requirementKey({ sourceQuote: Q_LOGIN })!;
    const survey = requirementKey({ sourceQuote: Q_SURVEY })!;
    const post = (u: unknown, k: string, note?: string) =>
      request(app).post(`${s.base}/claim`).set(s.as(u)).send({ requirementKey: k, note });

    expect((await post(s.member, key)).status).toBe(403);
    expect((await post(s.outsider, key)).status).toBe(403);
    expect((await post(s.instructor, key)).status).toBe(403);
    expect((await post(s.admin, key)).status).toBe(403);
    const covered = await post(s.leader, survey); // the AI already found it
    expect(covered.status).toBe(409);
    expect(covered.body.error).toBe("This item is already marked covered by the AI.");
    const missing = await post(s.leader, "0".repeat(32));
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("We could not find this item in the latest check. Please refresh the page.");

    const ok = await post(s.leader, key, "  It is in   src/Login.tsx  ");
    expect(ok.status).toBe(201);
    const row = await prisma.requirementMark.findUniqueOrThrow({ where: { id: ok.body.id } });
    expect(row).toMatchObject({ role: "LEADER", status: "LEADER_CLAIM", note: "It is in src/Login.tsx", sourceQuote: Q_LOGIN });
  });

  it("the note is cut to 140 characters", async () => {
    const s = await setup();
    const res = await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: requirementKey({ sourceQuote: Q_LOGIN }), note: "x".repeat(300) });
    expect(res.status).toBe(201);
    expect((await prisma.requirementMark.findUniqueOrThrow({ where: { id: res.body.id } })).note).toHaveLength(140);
  });

  it("a leader claim is not covered until the owning instructor confirms; others cannot confirm", async () => {
    const s = await setup();
    const key = requirementKey({ sourceQuote: Q_LOGIN })!;
    await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key });

    for (const u of [s.leader, s.member, s.otherInstructor, s.admin, s.outsider]) {
      expect((await request(app).post(`${s.base}/confirm`).set(s.as(u)).send({ requirementKey: key })).status).toBe(403);
    }
    expect((await prisma.requirementMark.count({ where: { role: "INSTRUCTOR" } }))).toBe(0);

    const ok = await request(app).post(`${s.base}/confirm`).set(s.as(s.instructor)).send({ requirementKey: key, note: "Checked the repo" });
    expect(ok.status).toBe(201);
    const marks = (await request(app).get(s.base).set(s.as(s.instructor))).body.marks as Array<{ role: string; status: string; note: string | null }>;
    expect(marks.map((m) => `${m.role}:${m.status}`).sort()).toEqual(["INSTRUCTOR:INSTRUCTOR_CONFIRMED", "LEADER:LEADER_CLAIM"]);
    // After confirmation the leader cannot claim again.
    expect((await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key })).status).toBe(409);
  });

  it("the instructor can mark any item 'I checked: covered' directly", async () => {
    const s = await setup();
    const res = await request(app).post(`${s.base}/confirm`).set(s.as(s.instructor)).send({ requirementKey: requirementKey({ sourceQuote: Q_SURVEY }) });
    expect(res.status).toBe(201);
  });

  it("'Not yet' declines a leader claim; the leader can then send a new note", async () => {
    const s = await setup();
    const key = requirementKey({ sourceQuote: Q_LOGIN })!;
    const claim = await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key, note: "first" });
    expect((await request(app).patch(`${s.base}/${claim.body.id}/decline`).set(s.as(s.leader))).status).toBe(403);
    expect((await request(app).patch(`${s.base}/${claim.body.id}/decline`).set(s.as(s.otherInstructor))).status).toBe(403);
    expect((await request(app).patch(`${s.base}/${claim.body.id}/decline`).set(s.as(s.instructor))).status).toBe(200);
    expect((await prisma.requirementMark.findUniqueOrThrow({ where: { id: claim.body.id } })).status).toBe("LEADER_CLAIM_DECLINED");

    const again = await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key, note: "second" });
    expect(again.body.id).toBe(claim.body.id);
    expect(await prisma.requirementMark.findUniqueOrThrow({ where: { id: claim.body.id } })).toMatchObject({ status: "LEADER_CLAIM", note: "second" });
  });
});

describe("requirement marks: items that share one sentence", () => {
  const Q = "Build a GraphHopper route planner with a Tkinter GUI and write its system documentation.";
  const covered = { text: "Use a Tkinter GUI.", status: "FOUND", evidence: [], sourceQuote: Q };
  const open = { text: "Write system documentation.", status: "NOT_FOUND", evidence: [], unverified: true, sourceQuote: Q };

  it("the open sibling can be claimed and confirmed; the covered sibling is refused for the leader", async () => {
    const s = await setup();
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: Q } });
    await s.review([covered, open]);
    const [kCovered, kOpen] = requirementKeys([covered, open]) as string[];
    expect(kCovered).not.toBe(kOpen);
    const claim = (k: string) => request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: k, note: "ok" });

    expect((await claim(kCovered!)).status).toBe(409);
    const ok = await claim(kOpen!);
    expect(ok.status).toBe(201);
    expect(await prisma.requirementMark.findUniqueOrThrow({ where: { id: ok.body.id } })).toMatchObject({ requirementText: open.text, requirementKey: kOpen });
    expect((await request(app).post(`${s.base}/confirm`).set(s.as(s.instructor)).send({ requirementKey: kOpen })).status).toBe(201);
    const marks = (await request(app).get(s.base).set(s.as(s.instructor))).body.marks as Array<{ requirementKey: string; stale: boolean }>;
    expect(marks.every((m) => m.requirementKey === kOpen && !m.stale)).toBe(true);
  });

  it("a verified 'not found' item can be claimed too", async () => {
    const s = await setup();
    const plain = { text: "Has a README.", status: "NOT_FOUND", evidence: [], sourceQuote: "Add a README." };
    await s.review([plain]);
    const res = await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: requirementKey(plain) });
    expect(res.status).toBe(201);
  });

  it("a sibling the AI reworded reads stale and the mark is not moved to another item", async () => {
    const s = await setup();
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: Q } });
    await s.review([covered, open]);
    const [, kOpen] = requirementKeys([covered, open]) as string[];
    await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: kOpen });
    await s.review([covered, { ...open, text: "Provide a user manual." }]);
    const marks = (await request(app).get(s.base).set(s.as(s.leader))).body.marks as Array<{ requirementKey: string; stale: boolean }>;
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ requirementKey: kOpen, stale: true });
  });
});

describe("requirement marks: who can see and undo", () => {
  it("members and the owning instructor see marks and names; outsiders, other instructors and admins do not", async () => {
    const s = await setup();
    await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: requirementKey({ sourceQuote: Q_LOGIN }), note: "here" });
    for (const u of [s.leader, s.member, s.instructor]) {
      const res = await request(app).get(s.base).set(s.as(u));
      expect(res.status).toBe(200);
      expect(res.body.marks).toHaveLength(1);
      expect(res.body.marks[0].markedBy.name).toBe("Lea Leader");
    }
    for (const u of [s.outsider, s.otherInstructor, s.admin]) {
      expect((await request(app).get(s.base).set(s.as(u))).status).toBe(403);
    }
  });

  it("one-tap undo for who marked; the owning instructor can remove any; others cannot", async () => {
    const s = await setup();
    const key = requirementKey({ sourceQuote: Q_LOGIN })!;
    const a = await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key });
    expect((await request(app).delete(`${s.base}/${a.body.id}`).set(s.as(s.member))).status).toBe(403);
    expect((await request(app).delete(`${s.base}/${a.body.id}`).set(s.as(s.otherInstructor))).status).toBe(403);
    expect((await request(app).delete(`${s.base}/${a.body.id}`).set(s.as(s.leader))).status).toBe(200);
    const b = await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key });
    expect((await request(app).delete(`${s.base}/${b.body.id}`).set(s.as(s.instructor))).status).toBe(200);
    expect(await prisma.requirementMark.count()).toBe(0);
  });

  it("a mark whose sentence was removed from the instructions reads stale; an unchanged one stays current", async () => {
    const s = await setup();
    const login = requirementKey({ sourceQuote: Q_LOGIN })!;
    await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: login });
    await request(app).post(`${s.base}/confirm`).set(s.as(s.instructor)).send({ requirementKey: requirementKey({ sourceQuote: Q_SURVEY }) });
    await prisma.assignment.update({ where: { id: s.asg.id }, data: { description: "Build a sign-in page. Students write a survey report." } });
    const marks = (await request(app).get(s.base).set(s.as(s.instructor))).body.marks as Array<{ requirementKey: string; stale: boolean }>;
    expect(marks.find((m) => m.requirementKey === login)!.stale).toBe(true);
    expect(marks.find((m) => m.requirementKey !== login)!.stale).toBe(false);
  });

  it("a regenerated check that rewords a requirement keeps its mark", async () => {
    const s = await setup();
    const key = requirementKey({ sourceQuote: Q_LOGIN })!;
    await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key });
    await s.review([{ text: "Provide a sign-in screen.", status: "NOT_FOUND", evidence: [], unverified: true, sourceQuote: Q_LOGIN }]);
    const marks = (await request(app).get(s.base).set(s.as(s.leader))).body.marks as Array<{ requirementKey: string; stale: boolean }>;
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ requirementKey: key, stale: false });
  });

  it("marks are deleted with the project", async () => {
    const s = await setup();
    await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: requirementKey({ sourceQuote: Q_LOGIN }) });
    await prisma.project.delete({ where: { id: s.project.id } });
    expect(await prisma.requirementMark.count()).toBe(0);
  });
});

describe("requirement marks: the screenshot", () => {
  async function withClaim() {
    const s = await setup();
    const claim = await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: requirementKey({ sourceQuote: Q_LOGIN }) });
    return { ...s, markId: claim.body.id as number };
  }
  const put = (url: string, auth: { Authorization: string }, body: Buffer, type = "image/png") =>
    request(app).put(url).set(auth).set("Content-Type", type).send(body);

  it("accepts a PNG from who marked, serves it only to members and the owning instructor", async () => {
    const s = await withClaim();
    const url = `${s.base}/${s.markId}/image`;
    expect((await put(url, s.as(s.leader), PNG)).status).toBe(200);
    const list = (await request(app).get(s.base).set(s.as(s.leader))).body.marks[0];
    expect(list).toMatchObject({ hasImage: true, imageUrl: url });

    for (const u of [s.leader, s.member, s.instructor]) {
      const res = await request(app).get(url).set(s.as(u));
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    }
    for (const u of [s.outsider, s.otherInstructor, s.admin]) {
      expect((await request(app).get(url).set(s.as(u))).status).toBe(403);
    }
  });

  it("only who marked can add or remove... and the instructor can remove the picture", async () => {
    const s = await withClaim();
    const url = `${s.base}/${s.markId}/image`;
    expect((await put(url, s.as(s.member), PNG)).status).toBe(403);
    expect((await put(url, s.as(s.instructor), PNG)).status).toBe(403);
    await put(url, s.as(s.leader), PNG);
    expect((await request(app).delete(url).set(s.as(s.member))).status).toBe(403);
    expect((await request(app).delete(url).set(s.as(s.instructor))).status).toBe(200);
    expect((await prisma.requirementMark.findUniqueOrThrow({ where: { id: s.markId } })).imageData).toBeNull();
  });

  it("sniffs the bytes (a PDF or junk labelled as an image is refused) and caps the size at 1 MB", async () => {
    const s = await withClaim();
    const url = `${s.base}/${s.markId}/image`;
    expect((await put(url, s.as(s.leader), Buffer.from("%PDF-1.4 fake"))).status).toBe(400);
    expect((await put(url, s.as(s.leader), Buffer.from("not an image at all"))).status).toBe(400);
    const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
    expect((await put(url, s.as(s.leader), big)).status).toBe(413);
    expect((await prisma.requirementMark.findUniqueOrThrow({ where: { id: s.markId } })).imageData).toBeNull();
  });
});

describe("requirement marks: nobody outside the group or the class gets in", () => {
  it("another group's leader and an instructor who does not own the class get 403 on claim, confirm and read", async () => {
    const s = await setup();
    // A leader of a different group (a different class and instructor).
    const { user: otherOwner } = await createUser({ systemRole: "INSTRUCTOR" });
    const otherCls = await createClassSection(otherOwner.id);
    const otherAsg = await createAssignment(otherCls.id);
    const otherProject = await createProject({ assignmentId: otherAsg.id });
    const { user: otherLeader } = await createUser({ systemRole: "STUDENT" });
    await createMembership(otherLeader.id, otherProject.id, "LEADER");

    const key = requirementKey({ sourceQuote: Q_LOGIN })!;
    for (const [who, user] of [["another group's leader", otherLeader], ["a non-owning instructor", s.otherInstructor]] as const) {
      expect((await request(app).post(`${s.base}/claim`).set(s.as(user)).send({ requirementKey: key })).status, `claim: ${who}`).toBe(403);
      expect((await request(app).post(`${s.base}/confirm`).set(s.as(user)).send({ requirementKey: key })).status, `confirm: ${who}`).toBe(403);
      expect((await request(app).get(s.base).set(s.as(user))).status, `read: ${who}`).toBe(403);
    }
    expect(await prisma.requirementMark.count()).toBe(0);

    // The real leader still can, and only for their own group.
    expect((await request(app).post(`${s.base}/claim`).set(s.as(s.leader)).send({ requirementKey: key })).status).toBe(201);
    expect((await request(app).post(`/api/groups/${otherProject.id}/requirement-marks/claim`).set(s.as(s.leader)).send({ requirementKey: key })).status).toBe(403);
  });
});

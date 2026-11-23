import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

// Characterisation (E1c-1): full response bodies of the three document reads, recorded from the code as it was
// before the reads were slimmed. Ids and timestamps are replaced by stable placeholders so the snapshot is
// the same on every run.
function normalise(body: unknown, ids: Record<string, number>): unknown {
  const byId = new Map(Object.entries(ids).map(([label, id]) => [id, label]));
  const walk = (v: unknown, key = ""): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    if (typeof v === "number" && /(^id$|Id$)/.test(key) && byId.has(v)) return `<${byId.get(v)}>`;
    if (typeof v === "string") return v.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<ts>");
    return v;
  };
  return walk(body);
}

async function setup(sourceType: "EDITOR" | "COMBINED" | "GITHUB" = "EDITOR") {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: other } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  const ids = { instructor: instructor.id, leader: leader.id, member: member.id, project: project.id };
  return { instructor, other, leader, member, outsider, project, ids };
}

async function addDocWithActivity(projectId: number, userId: number, what: "event" | "session" | "comment" | "none") {
  const doc = await prisma.document.create({ data: { groupId: projectId } });
  const now = new Date("2026-01-05T10:00:00Z");
  if (what === "event") {
    await prisma.editEvent.create({
      data: { documentId: doc.id, userId, eventType: "INSERT", position: 0, length: 5, timestamp: now, insertedText: "hello" } as never,
    });
  } else if (what === "session") {
    await prisma.editSession.create({
      data: { documentId: doc.id, userId, startedAt: now, endedAt: now, characterCount: 0, imageInsertCount: 1 } as never,
    });
  } else if (what === "comment") {
    await prisma.comment.create({
      data: { documentId: doc.id, authorId: userId, text: "Note", anchor: Buffer.from("a") },
    });
  }
  return doc;
}

describe("document reads: responses stay identical (characterisation)", () => {
  it("status: no document, fresh, with event, with session, with comment", async () => {
    const out: Record<string, unknown> = {};
    const a = await setup();
    const get = async (g: typeof a, who: typeof a.leader | typeof a.instructor | typeof a.outsider) => {
      const r = await request(app).get(`/api/groups/${g.project.id}/document/status`).set("Authorization", authHeaderFor(who));
      return { status: r.status, body: normalise(r.body, g.ids) };
    };
    out.noDoc = await get(a, a.leader);
    await addDocWithActivity(a.project.id, a.leader.id, "none");
    out.fresh = await get(a, a.leader);
    out.freshInstructor = await get(a, a.instructor);

    const b = await setup();
    await addDocWithActivity(b.project.id, b.leader.id, "event");
    out.withEvent = await get(b, b.leader);
    const c = await setup();
    await addDocWithActivity(c.project.id, c.leader.id, "session");
    out.withSession = await get(c, c.leader);
    const d = await setup();
    await addDocWithActivity(d.project.id, d.leader.id, "comment");
    out.withComment = await get(d, d.member);

    out.outsider = await get(a, a.outsider);
    out.otherInstructor = await get(a, a.other);
    const bad = await request(app).get(`/api/groups/abc/document/status`).set("Authorization", authHeaderFor(a.leader));
    out.badId = { status: bad.status, body: bad.body };
    const missing = await request(app).get(`/api/groups/99999999/document/status`).set("Authorization", authHeaderFor(a.leader));
    out.missing = { status: missing.status, body: missing.body };
    const anon = await request(app).get(`/api/groups/${a.project.id}/document/status`);
    out.anon = { status: anon.status, body: anon.body };
    expect(out).toMatchSnapshot();
  });

  it("authorship: no document, with events, wrong source type, no access", async () => {
    const out: Record<string, unknown> = {};
    const a = await setup();
    const get = async (g: typeof a, who: typeof a.leader | typeof a.instructor | typeof a.outsider) => {
      const r = await request(app).get(`/api/groups/${g.project.id}/document/authorship`).set("Authorization", authHeaderFor(who));
      return { status: r.status, body: normalise(r.body, g.ids) };
    };
    out.noDoc = await get(a, a.leader);
    await addDocWithActivity(a.project.id, a.leader.id, "event");
    out.withEvent = await get(a, a.member);
    out.instructor = await get(a, a.instructor);
    out.outsider = await get(a, a.outsider);
    const gh = await setup("GITHUB");
    out.githubGroup = await get(gh, gh.leader);
    const missing = await request(app).get(`/api/groups/99999999/document/authorship`).set("Authorization", authHeaderFor(a.leader));
    out.missing = { status: missing.status, body: missing.body };
    expect(out).toMatchSnapshot();
  });

  it("comments: none, root plus reply, no access, no document", async () => {
    const out: Record<string, unknown> = {};
    const a = await setup();
    const get = async (g: typeof a, who: typeof a.leader | typeof a.instructor | typeof a.outsider) => {
      const r = await request(app).get(`/api/groups/${g.project.id}/document/comments`).set("Authorization", authHeaderFor(who));
      return { status: r.status, body: normalise(r.body, g.ids) };
    };
    out.noDoc = await get(a, a.leader);
    const doc = await addDocWithActivity(a.project.id, a.leader.id, "none");
    out.empty = await get(a, a.leader);
    const root = await prisma.comment.create({
      data: { documentId: doc.id, authorId: a.leader.id, text: "Root", anchor: Buffer.from("anchor-1"), createdAt: new Date("2026-01-05T10:00:00Z") },
    });
    await prisma.comment.create({
      data: { documentId: doc.id, authorId: a.member.id, text: "Reply", anchor: Buffer.from("anchor-1"), parentId: root.id, createdAt: new Date("2026-01-05T10:01:00Z") },
    });
    const r = await request(app).get(`/api/groups/${a.project.id}/document/comments`).set("Authorization", authHeaderFor(a.instructor));
    out.thread = { status: r.status, body: normalise(r.body, { ...a.ids, root: root.id, doc: doc.id }) };
    out.outsider = await get(a, a.outsider);
    const missing = await request(app).get(`/api/groups/99999999/document/comments`).set("Authorization", authHeaderFor(a.leader));
    out.missing = { status: missing.status, body: missing.body };
    expect(out).toMatchSnapshot();
  });
});

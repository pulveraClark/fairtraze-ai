import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Count the real replays (the whole-log read) while still running them.
vi.mock("../src/collab/editReplay.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/collab/editReplay.js")>();
  return { ...real, fetchOrderedEvents: vi.fn(real.fetchOrderedEvents) };
});

import { fetchOrderedEvents } from "../src/collab/editReplay.js";
import { computeAuthorshipMap } from "../src/collab/authorshipMap.js";
import { getAuthorshipMapCached, clearAuthorshipMapCache } from "../src/lib/authorshipMapCache.js";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership } from "./factories.js";

const app = createApp();
const replays = () => vi.mocked(fetchOrderedEvents).mock.calls.length;

async function setup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: a } = await createUser({ systemRole: "STUDENT", name: "Ana" });
  const { user: b } = await createUser({ systemRole: "STUDENT", name: "Ben" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(a.id, project.id, "LEADER");
  await createMembership(b.id, project.id, "MEMBER");
  const doc = await prisma.document.create({ data: { groupId: project.id } });
  return { a, b, project, doc };
}

let t = 0;
const insert = (documentId: number, userId: number, position: number, length: number) =>
  prisma.editEvent.create({
    data: { documentId, userId, eventType: "INSERT", position, length, timestamp: new Date(Date.UTC(2026, 0, 5, 10, 0, t++)), insertedText: "x".repeat(length) } as never,
  });

beforeEach(() => {
  clearAuthorshipMapCache();
  vi.mocked(fetchOrderedEvents).mockClear();
});

describe("getAuthorshipMapCached", () => {
  it("replays the log once, then serves the same map without replaying", async () => {
    const { a, b, doc } = await setup();
    await insert(doc.id, a.id, 0, 5);
    await insert(doc.id, b.id, 5, 3);
    const first = await getAuthorshipMapCached(doc.id);
    expect(replays()).toBe(1);
    const second = await getAuthorshipMapCached(doc.id);
    expect(replays()).toBe(1);
    expect(second).toEqual(first);
    expect(first).toEqual(await computeAuthorshipMap(doc.id)); // equals an uncached computation
    expect(first.spans).toEqual([{ userId: a.id, start: 0, end: 5 }, { userId: b.id, start: 5, end: 8 }]);
  });

  it("never serves a map older than the latest event", async () => {
    const { a, b, doc } = await setup();
    await insert(doc.id, a.id, 0, 5);
    const before = await getAuthorshipMapCached(doc.id);
    expect(before.spans).toHaveLength(1);
    await insert(doc.id, b.id, 5, 4); // a new event, even a moment later
    const after = await getAuthorshipMapCached(doc.id);
    expect(replays()).toBe(2);
    expect(after.spans).toEqual([{ userId: a.id, start: 0, end: 5 }, { userId: b.id, start: 5, end: 9 }]);
    expect(after).toEqual(await computeAuthorshipMap(doc.id));
  });

  it("a removed event also invalidates", async () => {
    const { a, b, doc } = await setup();
    await insert(doc.id, a.id, 0, 5);
    const last = await insert(doc.id, b.id, 5, 4);
    await getAuthorshipMapCached(doc.id);
    await prisma.editEvent.delete({ where: { id: last.id } });
    const after = await getAuthorshipMapCached(doc.id);
    expect(replays()).toBe(2);
    expect(after.spans).toEqual([{ userId: a.id, start: 0, end: 5 }]);
  });

  it("a renamed user shows the new name from a cached map", async () => {
    const { a, doc } = await setup();
    await insert(doc.id, a.id, 0, 5);
    const first = await getAuthorshipMapCached(doc.id);
    expect(first.users).toEqual([{ id: a.id, name: "Ana" }]);
    await prisma.user.update({ where: { id: a.id }, data: { name: "Ana Renamed" } });
    const second = await getAuthorshipMapCached(doc.id);
    expect(replays()).toBe(1);
    expect(second.users).toEqual([{ id: a.id, name: "Ana Renamed" }]);
  });

  it("documents never share entries, and a document with no events is an empty map", async () => {
    const one = await setup();
    const two = await setup();
    await insert(one.doc.id, one.a.id, 0, 2);
    expect((await getAuthorshipMapCached(two.doc.id))).toEqual({ spans: [], users: [] });
    expect((await getAuthorshipMapCached(one.doc.id)).spans).toHaveLength(1);
    expect((await getAuthorshipMapCached(two.doc.id))).toEqual({ spans: [], users: [] });
  });

  it("concurrent callers share one replay", async () => {
    const { a, doc } = await setup();
    await insert(doc.id, a.id, 0, 5);
    const [x, y, z] = await Promise.all([getAuthorshipMapCached(doc.id), getAuthorshipMapCached(doc.id), getAuthorshipMapCached(doc.id)]);
    expect(replays()).toBe(1);
    expect(y).toEqual(x);
    expect(z).toEqual(x);
  });
});

describe("GET /api/groups/:id/document/authorship uses it without changing the body", () => {
  it("returns exactly the uncached map plus the same extra fields, on every call", async () => {
    const { a, b, project, doc } = await setup();
    await insert(doc.id, a.id, 0, 5);
    await insert(doc.id, b.id, 5, 3);
    const get = () => request(app).get(`/api/groups/${project.id}/document/authorship`).set("Authorization", authHeaderFor(a));
    const r1 = await get();
    const r2 = await get();
    expect(r1.status).toBe(200);
    expect(r2.text).toBe(r1.text);
    const fresh = await computeAuthorshipMap(doc.id);
    expect(r1.body.spans).toEqual(fresh.spans);
    expect(r1.body.users).toEqual(fresh.users);
    expect(Object.keys(r1.body)).toEqual(["spans", "users", "docsDataApproximate", "docsDataFixedAt"]);

    await insert(doc.id, b.id, 8, 2); // an edit between two requests shows up in the very next response
    const r3 = await get();
    expect(r3.body.spans.at(-1)).toEqual({ userId: b.id, start: 5, end: 10 });
  });
});

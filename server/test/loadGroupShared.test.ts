import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { singleFlight } from "../src/lib/singleFlight.js";
import { loadGroup, loadGroupShared } from "../src/lib/groupAccess.js";
import {
  createUser, authHeaderFor, createClassSection, createAssignment, createProject, createMembership,
} from "./factories.js";

const app = createApp();

async function group() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: leader } = await createUser({ systemRole: "STUDENT" });
  const { user: member } = await createUser({ systemRole: "STUDENT" });
  const { user: outsider } = await createUser({ systemRole: "STUDENT" });
  const cs = await createClassSection(instructor.id);
  const assignment = await createAssignment(cs.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id });
  await createMembership(leader.id, project.id, "LEADER");
  const memberShip = await createMembership(member.id, project.id, "MEMBER");
  return { instructor, leader, member, outsider, project, memberShip };
}

describe("singleFlight", () => {
  it("concurrent calls with one key run the function once and share the result", async () => {
    const fn = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); return { n: 1 }; });
    const [a, b, c] = await Promise.all([singleFlight("k", fn), singleFlight("k", fn), singleFlight("k", fn)]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("keeps nothing after it settles: the next call runs again", async () => {
    const fn = vi.fn(async () => ({ n: 1 }));
    await singleFlight("k2", fn);
    await singleFlight("k2", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("different keys never share", async () => {
    const fn = vi.fn(async () => ({}));
    await Promise.all([singleFlight("x", fn), singleFlight("y", fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a failure reaches every waiter and is not kept", async () => {
    const bad = vi.fn(async () => { throw new Error("boom"); });
    const results = await Promise.allSettled([singleFlight("e", bad), singleFlight("e", bad)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(bad).toHaveBeenCalledTimes(1);
    const good = vi.fn(async () => "ok");
    await expect(singleFlight("e", good)).resolves.toBe("ok");
  });
});

describe("loadGroupShared", () => {
  it("concurrent calls for one group run one project query; a later call runs another", async () => {
    const { project } = await group();
    // A plain counting wrapper that always puts the original back (spy restore would leave the delegate empty).
    const delegate = prisma.project as unknown as { findUnique: (...a: unknown[]) => unknown };
    const original = delegate.findUnique;
    let calls = 0;
    delegate.findUnique = (...a: unknown[]) => { calls++; return original.apply(delegate, a); };
    try {
      const [a, b, c] = await Promise.all([loadGroupShared(project.id), loadGroupShared(project.id), loadGroupShared(project.id)]);
      expect(calls).toBe(1);
      expect(a).toBe(b);
      expect(b).toBe(c);
      await loadGroupShared(project.id);
      expect(calls).toBe(2);
    } finally {
      delegate.findUnique = original;
    }
  });

  it("two different groups never share a result", async () => {
    const g1 = await group();
    const g2 = await group();
    const [a, b] = await Promise.all([loadGroupShared(g1.project.id), loadGroupShared(g2.project.id)]);
    expect(a!.id).toBe(g1.project.id);
    expect(b!.id).toBe(g2.project.id);
  });

  it("gives the same data as loadGroup and the result is frozen", async () => {
    const { project } = await group();
    const shared = await loadGroupShared(project.id);
    const plain = await loadGroup(project.id);
    expect(JSON.parse(JSON.stringify(shared))).toEqual(JSON.parse(JSON.stringify(plain)));
    expect(Object.isFrozen(shared)).toBe(true);
    expect(Object.isFrozen(shared!.groupMemberships)).toBe(true);
    expect(Object.isFrozen(shared!.groupMemberships[0])).toBe(true);
  });

  it("a missing group is null", async () => {
    await expect(loadGroupShared(2147483000)).resolves.toBeNull();
  });
});

describe("read routes still check the current user on shared group data", () => {
  it("simultaneous requests: member 200, outsider 403, instructor 200, same group", async () => {
    const g = await group();
    const url = `/api/groups/${g.project.id}/document/comments`;
    const [m, o, i] = await Promise.all([
      request(app).get(url).set("Authorization", authHeaderFor(g.member)),
      request(app).get(url).set("Authorization", authHeaderFor(g.outsider)),
      request(app).get(url).set("Authorization", authHeaderFor(g.instructor)),
    ]);
    expect([m.status, o.status, i.status]).toEqual([200, 403, 200]);
    expect(o.body).toEqual({ error: "You do not have access to this document." });
  });

  it("a member removed between two requests is refused on the next one", async () => {
    const g = await group();
    const url = `/api/groups/${g.project.id}/document/status`;
    const before = await request(app).get(url).set("Authorization", authHeaderFor(g.member));
    expect(before.status).toBe(200);
    await prisma.groupMembership.delete({ where: { id: g.memberShip.id } });
    const after = await request(app).get(url).set("Authorization", authHeaderFor(g.member));
    expect(after.status).toBe(403);
  });

  it("a deactivated user is blocked on the very next request (account check is not shared)", async () => {
    const g = await group();
    const url = `/api/groups/${g.project.id}/document/status`;
    expect((await request(app).get(url).set("Authorization", authHeaderFor(g.member))).status).toBe(200);
    await prisma.user.update({ where: { id: g.member.id }, data: { active: false } });
    const res = await request(app).get(url).set("Authorization", authHeaderFor(g.member));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("ACCOUNT_UNAVAILABLE");
  });
});

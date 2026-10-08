import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import {
  createUser,
  authHeaderFor,
  createClassSection,
  createAssignment,
  createProject,
  createMembership,
} from "./factories.js";

// Notification tests make many login calls in one file; the IP-keyed authLimiter
// would trip its cap (same reason auth.test.ts bypasses it).
vi.mock("../src/middleware/security.js", async () => {
  const actual = await vi.importActual<typeof import("../src/middleware/security.js")>(
    "../src/middleware/security.js"
  );
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return { ...actual, authLimiter: passthrough, analysisLimiter: passthrough };
});

const { createApp } = await import("../src/app.js");
const app = createApp();

// ── Scenario helpers ──────────────────────────────────────────────────────────

/** Instructor + EDITOR assignment (no GitHub username needed) + group with a leader and a member. */
async function setupGroup() {
  const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
  const { user: leader } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  const { user: member } = await createUser({ systemRole: "STUDENT", emailVerified: true });
  const classSection = await createClassSection(instructor.id);
  const assignment = await createAssignment(classSection.id, { sourceType: "EDITOR" });
  const project = await createProject({ assignmentId: assignment.id, groupName: "Group A" });
  await createMembership(leader.id, project.id, "LEADER");
  await createMembership(member.id, project.id, "MEMBER");
  for (const u of [leader, member]) {
    await prisma.classEnrollment.create({ data: { userId: u.id, classSectionId: classSection.id } });
  }
  return { instructor, leader, member, classSection, assignment, project };
}

async function createRequester(classSectionId: number) {
  const { user } = await createUser({ systemRole: "STUDENT", emailVerified: true, name: "Requester One" });
  await prisma.classEnrollment.create({ data: { userId: user.id, classSectionId } });
  return user;
}

async function countsByRecipient() {
  const rows = await prisma.alert.findMany({ select: { recipientId: true, type: true } });
  return rows;
}

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 3000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ── Join requests ─────────────────────────────────────────────────────────────

describe("join-request notifications", () => {
  it("submitting a request notifies only the leader, with only the requester's name", async () => {
    const { leader, instructor, member, classSection, project } = await setupGroup();
    const requester = await createRequester(classSection.id);

    const res = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(requester));
    expect(res.status).toBe(201);

    const rows = await prisma.alert.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: leader.id,
      type: "JOIN_REQUEST_RECEIVED",
      link: `/student/group/${project.id}?manage=1`,
      refType: "JOIN_REQUEST",
      refId: res.body.id,
    });
    expect(rows[0].message).toContain("Requester One");
    expect(rows[0].message).not.toMatch(/@|github|score|gini/i);
    expect([instructor.id, member.id, requester.id]).not.toContain(rows[0].recipientId);
  });

  it("accepting notifies only the requester and removes the leader's pending notification", async () => {
    const { leader, classSection, project } = await setupGroup();
    const requester = await createRequester(classSection.id);
    const submit = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(requester));
    expect(await prisma.alert.count()).toBe(1);

    const res = await request(app)
      .post(`/api/groups/requests/${submit.body.id}/accept`)
      .set("Authorization", authHeaderFor(leader));
    expect(res.status).toBe(200);

    const rows = await countsByRecipient();
    expect(rows).toEqual([{ recipientId: requester.id, type: "JOIN_REQUEST_ACCEPTED" }]);
    const row = await prisma.alert.findFirstOrThrow();
    expect(row.link).toBe(`/student/group/${project.id}`);
  });

  it("declining notifies only the requester (link → class page) and removes the leader's notification", async () => {
    const { leader, classSection, project } = await setupGroup();
    const requester = await createRequester(classSection.id);
    const submit = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(requester));

    const res = await request(app)
      .post(`/api/groups/requests/${submit.body.id}/decline`)
      .set("Authorization", authHeaderFor(leader));
    expect(res.status).toBe(200);

    const rows = await prisma.alert.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: requester.id,
      type: "JOIN_REQUEST_DECLINED",
      link: `/student/class/${classSection.id}`,
    });
  });

  it("cancelling removes the leader's pending notification and notifies nobody", async () => {
    const { leader, classSection, project } = await setupGroup();
    const requester = await createRequester(classSection.id);
    const submit = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(requester));
    expect(await prisma.alert.count({ where: { recipientId: leader.id } })).toBe(1);

    const res = await request(app)
      .post(`/api/groups/requests/${submit.body.id}/cancel`)
      .set("Authorization", authHeaderFor(requester));
    expect(res.status).toBe(200);

    expect(await prisma.alert.count()).toBe(0);
  });

  it("an instructor resolving the request also clears the leader's notification", async () => {
    const { leader, instructor, classSection, project } = await setupGroup();
    const requester = await createRequester(classSection.id);
    const submit = await request(app)
      .post(`/api/groups/${project.id}/request`)
      .set("Authorization", authHeaderFor(requester));

    await request(app)
      .post(`/api/groups/requests/${submit.body.id}/decline`)
      .set("Authorization", authHeaderFor(instructor));

    expect(await prisma.alert.count({ where: { recipientId: leader.id } })).toBe(0);
    expect(await prisma.alert.count({ where: { recipientId: requester.id } })).toBe(1);
  });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

describe("task-assignment notifications", () => {
  it("creating a task notifies only the assignee", async () => {
    const { leader, member, project } = await setupGroup();

    const res = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Write intro", assignedToUserId: member.id });
    expect(res.status).toBe(201);

    const rows = await prisma.alert.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: member.id,
      type: "TASK_ASSIGNED",
      link: `/student/group/${project.id}`,
    });
  });

  it("never notifies the actor when they assign a task to themselves", async () => {
    const { leader, project } = await setupGroup();

    await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "My own task", assignedToUserId: leader.id });

    expect(await prisma.alert.count()).toBe(0);
  });

  it("an unassigned task notifies nobody", async () => {
    const { leader, project } = await setupGroup();
    await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Unassigned" });
    expect(await prisma.alert.count()).toBe(0);
  });

  it("reassigning notifies only the new assignee; keeping the same assignee notifies nobody", async () => {
    const { leader, member, project } = await setupGroup();
    const created = await request(app)
      .post(`/api/groups/${project.id}/tasks`)
      .set("Authorization", authHeaderFor(leader))
      .send({ title: "Task", assignedToUserId: leader.id }); // self → no notification
    expect(await prisma.alert.count()).toBe(0);

    const taskId = created.body.id as number;
    const reassign = await request(app)
      .put(`/api/groups/${project.id}/tasks/${taskId}`)
      .set("Authorization", authHeaderFor(leader))
      .send({ assignedToUserId: member.id });
    expect(reassign.status).toBe(200);
    expect(await countsByRecipient()).toEqual([{ recipientId: member.id, type: "TASK_ASSIGNED" }]);

    // Same assignee again (e.g. a title edit) → still just the one.
    await request(app)
      .put(`/api/groups/${project.id}/tasks/${taskId}`)
      .set("Authorization", authHeaderFor(leader))
      .send({ assignedToUserId: member.id, title: "Renamed" });
    expect(await prisma.alert.count()).toBe(1);
  });
});

// ── Disputes ──────────────────────────────────────────────────────────────────

describe("dispute notifications", () => {
  it("filing a dispute still creates exactly one DISPUTE_FILED alert for the instructor (legacy behaviour)", async () => {
    const { instructor, member, project } = await setupGroup();

    const res = await request(app)
      .post("/api/disputes")
      .set("Authorization", authHeaderFor(member))
      .send({ projectId: project.id, reason: "I did offline work" });
    expect(res.status).toBe(201);

    const alert = await waitFor(() => prisma.alert.findFirst());
    expect(alert).toMatchObject({
      type: "DISPUTE_FILED",
      instructorId: instructor.id,
      recipientId: instructor.id,
      link: "/disputes",
    });
    expect(await prisma.alert.count()).toBe(1);
  });

  it("responding to a dispute notifies only the student, without the response text", async () => {
    const { instructor, member, project } = await setupGroup();
    const dispute = await prisma.dispute.create({
      data: { projectId: project.id, studentUserId: member.id, memberName: member.name, reason: "x", disputedFlags: "[]" },
    });

    const res = await request(app)
      .post(`/api/disputes/${dispute.id}/resolve`)
      .set("Authorization", authHeaderFor(instructor))
      .send({ status: "RESOLVED", instructorResponse: "Confidential: score was 0.12" });
    expect(res.status).toBe(200);

    const rows = await prisma.alert.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientId: member.id,
      type: "DISPUTE_RESPONDED",
      link: `/student/group/${project.id}`,
    });
    expect(rows[0].message).not.toContain("0.12");
  });
});

// ── Lockout ───────────────────────────────────────────────────────────────────

describe("account-lockout notifications", () => {
  async function failLogins(email: string, times: number) {
    for (let i = 0; i < times; i++) {
      await request(app).post("/api/auth/login").send({ email, password: "wrong-password" });
    }
  }

  it("locking an account notifies every admin exactly once and nobody else", async () => {
    const { user: admin1 } = await createUser({ systemRole: "ADMIN" });
    const { user: admin2 } = await createUser({ systemRole: "ADMIN" });
    const { user: inactiveAdmin } = await createUser({ systemRole: "ADMIN", active: false });
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: victim } = await createUser({ systemRole: "STUDENT" });

    await failLogins(victim.email, 5);
    expect(await prisma.alert.count()).toBe(0); // not locked yet

    await failLogins(victim.email, 1);
    const rows = await prisma.alert.findMany();
    expect(rows.map((r) => r.recipientId).sort()).toEqual([admin1.id, admin2.id].sort());
    expect(rows.every((r) => r.type === "ACCOUNT_LOCKED" && r.link === "/admin")).toBe(true);
    expect([instructor.id, victim.id, inactiveAdmin.id]).not.toContain(rows[0].recipientId);

    // Further attempts while locked do not add more.
    await failLogins(victim.email, 3);
    expect(await prisma.alert.count()).toBe(2);
  });

  it("collapses: a re-lock while the previous notice is unread updates it instead of stacking", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const { user: victim } = await createUser({ systemRole: "STUDENT" });

    await failLogins(victim.email, 6);
    expect(await prisma.alert.count({ where: { recipientId: admin.id } })).toBe(1);

    // Simulate the 15-minute lock expiring, then a further wrong attempt re-locking.
    await prisma.user.update({ where: { id: victim.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await failLogins(victim.email, 1);

    expect(await prisma.alert.count({ where: { recipientId: admin.id } })).toBe(1);
  });
});

// ── Ownership ─────────────────────────────────────────────────────────────────

describe("notification ownership", () => {
  async function twoUsers() {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const { user: b } = await createUser({ systemRole: "STUDENT" });
    const alertB = await prisma.alert.create({
      data: { recipientId: b.id, type: "TASK_ASSIGNED", message: "B's private notice", link: "/student" },
    });
    return { a, b, alertB };
  }

  it("user A cannot see user B's notifications", async () => {
    const { a } = await twoUsers();
    const res = await request(app).get("/api/alerts").set("Authorization", authHeaderFor(a));
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(0);
    expect(res.body.unreadCount).toBe(0);
  });

  it("user A cannot mark B's notification read (403, row unchanged)", async () => {
    const { a, alertB } = await twoUsers();
    const res = await request(app).post(`/api/alerts/${alertB.id}/read`).set("Authorization", authHeaderFor(a));
    expect(res.status).toBe(403);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alertB.id } })).read).toBe(false);
  });

  it("user A cannot delete B's notification (403, row remains)", async () => {
    const { a, alertB } = await twoUsers();
    const res = await request(app).delete(`/api/alerts/${alertB.id}`).set("Authorization", authHeaderFor(a));
    expect(res.status).toBe(403);
    expect(await prisma.alert.count({ where: { id: alertB.id } })).toBe(1);
  });

  it("read-all only touches the caller's own notifications", async () => {
    const { a, alertB } = await twoUsers();
    await prisma.alert.create({ data: { recipientId: a.id, type: "TASK_ASSIGNED", message: "A's", link: "/student" } });

    const res = await request(app).post("/api/alerts/read-all").set("Authorization", authHeaderFor(a));
    expect(res.status).toBe(200);
    expect((await prisma.alert.findUniqueOrThrow({ where: { id: alertB.id } })).read).toBe(false);
    expect(await prisma.alert.count({ where: { recipientId: a.id, read: false } })).toBe(0);
  });

  it("owner can read and delete their own notification; all roles can list", async () => {
    const { b, alertB } = await twoUsers();
    const list = await request(app).get("/api/alerts").set("Authorization", authHeaderFor(b));
    expect(list.body.alerts).toHaveLength(1);

    expect((await request(app).post(`/api/alerts/${alertB.id}/read`).set("Authorization", authHeaderFor(b))).status).toBe(200);
    expect((await request(app).delete(`/api/alerts/${alertB.id}`).set("Authorization", authHeaderFor(b))).status).toBe(200);
    expect(await prisma.alert.count()).toBe(0);

    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    expect((await request(app).get("/api/alerts").set("Authorization", authHeaderFor(admin))).status).toBe(200);
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/alerts")).status).toBe(401);
  });
});

// ── Pruning ───────────────────────────────────────────────────────────────────

describe("lazy pruning", () => {
  it("deletes the caller's read notifications older than 30 days on fetch, and nothing else", async () => {
    const { user: a } = await createUser({ systemRole: "STUDENT" });
    const { user: b } = await createUser({ systemRole: "STUDENT" });
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const mk = (recipientId: number, read: boolean, createdAt: Date, message: string) =>
      prisma.alert.create({ data: { recipientId, type: "TASK_ASSIGNED", message, link: "/student", read, createdAt } });

    await mk(a.id, true, old, "read-old (pruned)");
    await mk(a.id, false, old, "unread-old (kept)");
    await mk(a.id, true, new Date(), "read-recent (kept)");
    await mk(b.id, true, old, "other user's read-old (kept)");

    const res = await request(app).get("/api/alerts").set("Authorization", authHeaderFor(a));
    expect(res.body.alerts.map((x: { message: string }) => x.message).sort()).toEqual([
      "read-recent (kept)",
      "unread-old (kept)",
    ]);
    expect(await prisma.alert.count({ where: { recipientId: b.id } })).toBe(1);
  });
});

// ── Failure isolation ─────────────────────────────────────────────────────────

describe("notification failures never fail the main action", () => {
  it("a task is still created (201) when notification insertion throws", async () => {
    const { leader, member, project } = await setupGroup();
    const spy = vi.spyOn(prisma.alert, "create").mockRejectedValue(new Error("db down"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await request(app)
        .post(`/api/groups/${project.id}/tasks`)
        .set("Authorization", authHeaderFor(leader))
        .send({ title: "Survives", assignedToUserId: member.id });
      expect(res.status).toBe(201);
      expect(await prisma.task.count()).toBe(1);
      expect(errSpy).toHaveBeenCalledWith("[notify] failed to create notification:", expect.any(Error));
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  });
  it("a recipient resolver that throws is swallowed inside notify()", async () => {
    const { notify } = await import("../src/lib/notify.js");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        notify({
          recipientIds: async () => { throw new Error("lookup failed"); },
          type: "ACCOUNT_LOCKED",
          message: "x",
          link: "/admin",
        })
      ).resolves.toBeUndefined();
      expect(await prisma.alert.count()).toBe(0);
    } finally {
      errSpy.mockRestore();
    }
  });
});

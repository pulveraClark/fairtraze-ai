import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

describe("GET /api/alerts/unread-count", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/alerts/unread-count");
    expect(res.status).toBe(401);
  });

  it("counts only the caller's unread alerts and returns no list", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const { user: other } = await createUser({ systemRole: "STUDENT" });

    await prisma.alert.createMany({
      data: [
        { recipientId: user.id, type: "TASK_ASSIGNED", message: "unread 1" },
        { recipientId: user.id, type: "TASK_ASSIGNED", message: "unread 2" },
        { recipientId: user.id, type: "TASK_ASSIGNED", message: "already read", read: true },
        { recipientId: other.id, type: "TASK_ASSIGNED", message: "someone else's" },
      ],
    });

    const res = await request(app)
      .get("/api/alerts/unread-count")
      .set("Authorization", authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unreadCount: 2 });
  });

  it("does not prune old read alerts (that stays on the list endpoint)", async () => {
    const { user } = await createUser({ systemRole: "STUDENT" });
    const old = await prisma.alert.create({
      data: {
        recipientId: user.id,
        type: "TASK_ASSIGNED",
        message: "old read",
        read: true,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .get("/api/alerts/unread-count")
      .set("Authorization", authHeaderFor(user));
    expect(res.body).toEqual({ unreadCount: 0 });

    expect(await prisma.alert.findUnique({ where: { id: old.id } })).not.toBeNull();
  });
});

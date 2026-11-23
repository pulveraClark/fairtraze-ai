import { describe, it, expect } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma.js";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

// INT-040: notification texts can name other people, so the export carries type, read state and date only.
describe("GET /api/privacy/export - notifications", () => {
  async function exportFor(role: "INSTRUCTOR" | "STUDENT" | "ADMIN") {
    const { user: me } = await createUser({ systemRole: role, name: `Own ${role}`, email: `own-${role.toLowerCase()}@uclm.edu.ph` });
    const { user: other } = await createUser({ systemRole: "STUDENT", name: "Nathaniel Tiro", email: "nathaniel.tiro@uclm.edu.ph" });

    await prisma.alert.createMany({
      data: [
        { recipientId: me.id, type: "DISPUTE_FILED", message: "New dispute from Nathaniel Tiro, Group 1, CC-DEMO-41", link: "/disputes", read: false },
        { recipientId: me.id, type: "JOIN_REQUEST_RECEIVED", message: "Nathaniel Tiro requested to join Group 1", link: "/student/group/1?manage=1", read: true },
        { recipientId: me.id, type: "DELETION_REQUESTED", message: "Account deletion requested by Nathaniel Tiro", link: "/admin?section=deletion-requests", read: false },
      ],
    });

    const res = await request(app).get("/api/privacy/export").set("Authorization", authHeaderFor(me));
    expect(res.status).toBe(200);
    return { res, body: JSON.parse(res.text) as { note: string; alerts: Array<Record<string, unknown>> } };
  }

  for (const role of ["INSTRUCTOR", "STUDENT", "ADMIN"] as const) {
    it(`${role}: the file lists the notifications without their text or the other person's name`, async () => {
      const { res, body } = await exportFor(role);

      expect(body.alerts).toHaveLength(3);
      for (const a of body.alerts) {
        expect(Object.keys(a).sort()).toEqual(["createdAt", "read", "type"]);
      }
      expect(body.alerts.map((a) => a.type).sort()).toEqual(["DELETION_REQUESTED", "DISPUTE_FILED", "JOIN_REQUEST_RECEIVED"]);
      expect(body.alerts.filter((a) => a.read === true)).toHaveLength(1);

      for (const leak of ["Nathaniel", "Tiro", "nathaniel.tiro@uclm.edu.ph", "CC-DEMO-41", "requested to join", "/disputes"]) {
        expect(res.text).not.toContain(leak);
      }
      expect(body.note).toContain("Notification texts are not included because they can name other people.");
    });
  }
});

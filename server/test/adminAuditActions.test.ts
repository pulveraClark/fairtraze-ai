import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";

const app = createApp();

type AuditEntry = { actorName: string; action: string; targetId: string | null; details: string | null; createdAt: string };

async function auditFor(admin: Parameters<typeof authHeaderFor>[0], action: string): Promise<AuditEntry[]> {
  const res = await request(app).get(`/api/admin/audit?action=${action}&pageSize=100`).set("Authorization", authHeaderFor(admin));
  expect(res.status).toBe(200);
  return res.body.entries as AuditEntry[];
}

describe("admin actions are written to the audit log", () => {
  // INT-036
  it("a department creation and a rejected deletion request each leave a row with the admin's name and a time", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN", name: "Ada Auditor" });
    const before = Date.now() - 60_000;

    const dept = await request(app)
      .post("/api/admin/departments")
      .set("Authorization", authHeaderFor(admin))
      .send({ name: "College of Audit Trails", code: "CAT" });
    expect(dept.status).toBe(201);

    const { user: student } = await createUser({ systemRole: "STUDENT", name: "Pat Audit" });
    const filed = await request(app).post("/api/privacy/deletion-request").set("Authorization", authHeaderFor(student)).send({});
    expect(filed.status).toBe(201);
    const requestId = filed.body.request.id as number;
    const rejected = await request(app).post(`/api/admin/deletion-requests/${requestId}/reject`).set("Authorization", authHeaderFor(admin)).send({});
    expect(rejected.status).toBe(200);

    const created = (await auditFor(admin, "DEPARTMENT_CREATED")).find((e) => (e.details ?? "").includes("College of Audit Trails"));
    expect(created, "DEPARTMENT_CREATED row").toBeDefined();
    expect(created!.actorName).toBe("Ada Auditor");
    expect(Number.isNaN(Date.parse(created!.createdAt))).toBe(false);
    expect(Date.parse(created!.createdAt)).toBeGreaterThan(before);

    const reject = (await auditFor(admin, "ACCOUNT_ERASURE_REJECTED")).find((e) => e.targetId === String(student.id));
    expect(reject, "ACCOUNT_ERASURE_REJECTED row").toBeDefined();
    expect(reject!.actorName).toBe("Ada Auditor");
    expect(reject!.details).toContain(`#${requestId}`);
    expect(Date.parse(reject!.createdAt)).toBeGreaterThan(before);
  });
});

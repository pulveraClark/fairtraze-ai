import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createUser, authHeaderFor } from "./factories.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();

describe("department management", () => {
  it("allows an ADMIN to create a department", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });

    const res = await request(app)
      .post("/api/admin/departments")
      .set("Authorization", authHeaderFor(admin))
      .send({ name: "College of Engineering", code: "COE" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("College of Engineering");
    expect(res.body.code).toBe("COE");
  });

  it("blocks a non-ADMIN from creating a department", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });

    const res = await request(app)
      .post("/api/admin/departments")
      .set("Authorization", authHeaderFor(instructor))
      .send({ name: "College of Engineering", code: "COE" });

    expect(res.status).toBe(403);
  });

  it("lists created departments via GET /api/admin/departments", async () => {
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const created = await prisma.department.create({ data: { name: "College of Nursing", code: "CON" } });

    const res = await request(app)
      .get("/api/admin/departments")
      .set("Authorization", authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(res.body.departments.some((d: { id: number }) => d.id === created.id)).toBe(true);
  });
});

describe("class creation requires a valid department", () => {
  it("rejects POST /api/classes with no departmentId", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });

    const res = await request(app)
      .post("/api/classes")
      .set("Authorization", authHeaderFor(instructor))
      .send({ subjectCode: "CC-TEST", subjectName: "Test Subject", edpCode: "99999" });

    expect(res.status).toBe(400);
  });

  it("rejects POST /api/classes with a nonexistent departmentId", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });

    const res = await request(app)
      .post("/api/classes")
      .set("Authorization", authHeaderFor(instructor))
      .send({ subjectCode: "CC-TEST", subjectName: "Test Subject", edpCode: "99999", departmentId: 999999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/department/i);
  });

  it("succeeds with a valid departmentId", async () => {
    const { user: instructor } = await createUser({ systemRole: "INSTRUCTOR" });
    const department = await prisma.department.create({ data: { name: "College of Computer Studies", code: "CCS" } });

    const res = await request(app)
      .post("/api/classes")
      .set("Authorization", authHeaderFor(instructor))
      .send({ subjectCode: "CC-TEST", subjectName: "Test Subject", edpCode: "99999", departmentId: department.id });

    expect(res.status).toBe(201);
    expect(res.body.departmentId).toBe(department.id);
  });
});

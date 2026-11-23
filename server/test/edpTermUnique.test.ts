import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor, createClassSection, getDefaultTestDepartmentId } from "./factories.js";
import { EDP_TAKEN_MESSAGE } from "@shared/schoolTerm.js";

const app = createApp();

async function create(instructor: Awaited<ReturnType<typeof createUser>>["user"], body: Record<string, unknown>) {
  return request(app).post("/api/classes").set("Authorization", authHeaderFor(instructor)).send({
    subjectCode: "CC-TERM", subjectName: "Term Test", departmentId: await getDefaultTestDepartmentId(), ...body,
  });
}

describe("EDP code is unique per term across all instructors", () => {
  it("refuses a code already used in the same term, by anyone, without naming the owner", async () => {
    const { user: a } = await createUser({ systemRole: "INSTRUCTOR", name: "Owner Olga" });
    const { user: b } = await createUser({ systemRole: "INSTRUCTOR" });
    const term = { schoolYear: "2031-2032", semester: "FIRST" };
    expect((await create(a, { edpCode: "T-77001", ...term })).status).toBe(201);

    const res = await create(b, { edpCode: "T-77001", ...term });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: "EDP_TAKEN", error: EDP_TAKEN_MESSAGE });
    expect(JSON.stringify(res.body)).not.toMatch(/Olga|CC-TERM|Term Test/);
  });

  it("allows the same code in another term, and the same class name", async () => {
    const { user: a } = await createUser({ systemRole: "INSTRUCTOR" });
    expect((await create(a, { edpCode: "T-77002", schoolYear: "2031-2032", semester: "FIRST" })).status).toBe(201);
    expect((await create(a, { edpCode: "T-77002", schoolYear: "2031-2032", semester: "SECOND" })).status).toBe(201);
    expect((await create(a, { edpCode: "T-77002", schoolYear: "2032-2033", semester: "FIRST" })).status).toBe(201);
  });

  it("prefills the current term when the client sends none, and rejects a bad school year", async () => {
    const { user: a } = await createUser({ systemRole: "INSTRUCTOR" });
    const ok = await create(a, { edpCode: "T-77003" });
    expect(ok.status).toBe(201);
    expect(ok.body.schoolYear).toMatch(/^\d{4}-\d{4}$/);
    expect(["FIRST", "SECOND", "SUMMER"]).toContain(ok.body.semester);
    expect((await create(a, { edpCode: "T-77004", schoolYear: "2031-2035" })).status).toBe(400);
  });

  it("the database index also refuses a duplicate and ignores empty codes", async () => {
    const { user: a } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: b } = await createUser({ systemRole: "INSTRUCTOR" });
    const term = { schoolYear: "2033-2034", semester: "SUMMER" as const };
    await createClassSection(a.id, { edpCode: "T-77005", ...term });
    await expect(createClassSection(b.id, { edpCode: "T-77005", ...term })).rejects.toMatchObject({ code: "P2002" });
    await createClassSection(a.id, { edpCode: "", ...term });
    await createClassSection(b.id, { edpCode: "", ...term });
  });

  it("an admin can change or release a code; others cannot; the answer shows no class details", async () => {
    const { user: owner } = await createUser({ systemRole: "INSTRUCTOR" });
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const term = { schoolYear: "2034-2035", semester: "FIRST" as const };
    const cls = await createClassSection(owner.id, { edpCode: "T-77006", ...term });
    const patch = (u: typeof admin, body: Record<string, unknown>) =>
      request(app).patch("/api/admin/edp-codes").set("Authorization", authHeaderFor(u)).send({ edpCode: "T-77006", ...term, ...body });

    expect((await patch(owner, { newEdpCode: "" })).status).toBe(403);
    const changed = await patch(admin, { newEdpCode: "T-77007" });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({ ok: true });
    expect((await prisma.classSection.findUniqueOrThrow({ where: { id: cls.id } })).edpCode).toBe("T-77007");
    expect((await patch(admin, { newEdpCode: "" })).status).toBe(404); // old code no longer exists
    const released = await request(app).patch("/api/admin/edp-codes").set("Authorization", authHeaderFor(admin)).send({ edpCode: "T-77007", ...term, newEdpCode: "" });
    expect(released.status).toBe(200);
    expect((await prisma.classSection.findUniqueOrThrow({ where: { id: cls.id } })).edpCode).toBe("");
  });
});

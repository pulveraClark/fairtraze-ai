import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createUser, authHeaderFor } from "./factories.js";
import { csvCell, toCsv } from "../src/lib/csv.js";

const app = createApp();

describe("csv helpers", () => {
  it("quotes commas, quotes and newlines, and neutralises formulas", () => {
    expect(csvCell('Lee, "Pat"')).toBe('"Lee, ""Pat"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell(null)).toBe("");
  });

  it("starts with a BOM and uses CRLF", () => {
    expect(toCsv(["a"], [["b"]])).toBe("\uFEFFa\r\nb\r\n");
  });
});

describe("GET /api/admin/users/export.csv", () => {
  it("exports the filtered list with the six columns, never the password hash, and audits it", async () => {
    const tag = `Exp${Date.now()}`;
    const { user: admin } = await createUser({ systemRole: "ADMIN" });
    const a = (await createUser({ name: `${tag} =Danger`, systemRole: "STUDENT" })).user;
    await createUser({ name: `${tag} Other`, systemRole: "INSTRUCTOR" });
    await prisma.user.update({ where: { id: a.id }, data: { lastLoginAt: new Date("2026-10-01T00:00:00Z") } });

    const res = await request(app)
      .get("/api/admin/users/export.csv")
      .query({ search: tag, role: "STUDENT" })
      .set("Authorization", authHeaderFor(admin));

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="fairtraze-users-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = res.text.replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(lines[0]).toBe("Name,Email,Role,Status,Joined,Last active");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`${tag} =Danger`);
    expect(lines[1]).toContain(",STUDENT,Active,");
    expect(lines[1]).toContain("2026-10-01T00:00:00.000Z");
    expect(res.text).not.toMatch(/passwordHash|\$2[aby]\$/);

    const audit = await prisma.auditLog.findFirst({ where: { action: "USERS_EXPORTED", actorId: admin.id } });
    expect(audit?.details).toBe("1 user exported to CSV");
  });

  it("is admin only", async () => {
    const { user: student } = await createUser();
    expect((await request(app).get("/api/admin/users/export.csv").set("Authorization", authHeaderFor(student))).status).toBe(403);
    expect((await request(app).get("/api/admin/users/export.csv")).status).toBe(401);
  });
});

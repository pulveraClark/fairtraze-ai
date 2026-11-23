import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";
import { createUser, createClassSection, createAssignment, createProject } from "./factories.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = "20261017100000_page_size_rename_custom_margins";
const sql = fs.readFileSync(path.resolve(here, "../prisma/migrations", MIGRATION, "migration.sql"), "utf8");

// The test database already ran the migration, so the data-migration statements are replayed on
// rows put back into their pre-migration state: that is what existing documents look like when the
// migration reaches them. (They are plain UPDATEs, so replaying them is idempotent.)
describe(`migration ${MIGRATION}`, () => {
  const updates = sql.split("\n").filter((l) => l.startsWith("UPDATE ")).map((l) => l.trim());

  async function legacyDoc(pageSize: string, marginPreset: string) {
    const { user } = await createUser({ systemRole: "INSTRUCTOR" });
    const cs = await createClassSection(user.id);
    const a = await createAssignment(cs.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: a.id });
    // Pre-migration state: old paper key, the 1 in column default, preset only.
    return prisma.document.create({
      data: { groupId: project.id, pageSize, marginPreset, marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1 },
    });
  }

  it("has the data-migration statements this test replays", () => {
    expect(updates.length).toBe(4);
  });

  it("maps SHORT to LETTER, LONG to LEGAL and leaves A4 alone", async () => {
    const short = await legacyDoc("SHORT", "NORMAL");
    const long = await legacyDoc("LONG", "NORMAL");
    const a4 = await legacyDoc("A4", "NORMAL");
    for (const u of updates) await prisma.$executeRawUnsafe(u);
    const read = (id: number) => prisma.document.findUniqueOrThrow({ where: { id } });
    expect((await read(short.id)).pageSize).toBe("LETTER");
    expect((await read(long.id)).pageSize).toBe("LEGAL");
    expect((await read(a4.id)).pageSize).toBe("A4");
  });

  it("backfills the four margins from the existing preset", async () => {
    const normal = await legacyDoc("LETTER", "NORMAL");
    const narrow = await legacyDoc("LETTER", "NARROW");
    const wide = await legacyDoc("LETTER", "WIDE");
    for (const u of updates) await prisma.$executeRawUnsafe(u);
    const m = async (id: number) => {
      const d = await prisma.document.findUniqueOrThrow({ where: { id } });
      return [d.marginTop, d.marginBottom, d.marginLeft, d.marginRight];
    };
    expect(await m(normal.id)).toEqual([1, 1, 1, 1]);
    expect(await m(narrow.id)).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(await m(wide.id)).toEqual([1, 1, 2, 2]);
  });

  it("new documents default to LETTER, NORMAL and 1 in margins", async () => {
    const { user } = await createUser({ systemRole: "INSTRUCTOR" });
    const cs = await createClassSection(user.id);
    const a = await createAssignment(cs.id, { sourceType: "EDITOR" });
    const project = await createProject({ assignmentId: a.id });
    const d = await prisma.document.create({ data: { groupId: project.id } });
    expect(d).toMatchObject({ pageSize: "LETTER", marginPreset: "NORMAL", marginTop: 1, marginBottom: 1, marginLeft: 1, marginRight: 1 });
  });

  it("is one migration: the rename and the margin columns ship together", () => {
    expect(sql).toMatch(/ADD COLUMN "marginTop"/);
    expect(sql).toMatch(/SET DEFAULT 'LETTER'/);
    expect(sql).toMatch(/'SHORT'/);
  });
});

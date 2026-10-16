import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";
import { deriveTaskKey } from "../src/lib/taskKey.js";

// Existing task data must survive the migration. This runs the BACKFILL section of migration
// 20261018100000_task_board_fields (the exact text, not a copy) against legacy-shaped rows in a
// throwaway schema, so no real table is touched.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.resolve(__dirname, "../prisma/migrations/20261018100000_task_board_fields/migration.sql"), "utf8",
);
// Drop the rest of the marker line itself ("(the same statements ...)").
const backfillSql = migration
  .split("-- BEGIN BACKFILL")[1]!.split("-- END BACKFILL")[0]!
  .split("\n").slice(1).join("\n");
const statements = backfillSql
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);

const SCHEMA = "task_backfill_test";

describe("task board migration backfill", () => {
  it("has the statements we expect to run", () => {
    expect(statements.length).toBeGreaterThanOrEqual(5);
  });

  it("turns legacy tasks into statuses, per-group numbers, column order and keys", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await tx.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${SCHEMA}`);
      await tx.$executeRawUnsafe(`CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE')`);
      await tx.$executeRawUnsafe(`CREATE TABLE "Project" ("id" INT PRIMARY KEY, "groupName" TEXT NOT NULL, "taskKey" TEXT, "nextTaskNumber" INT NOT NULL DEFAULT 1)`);
      await tx.$executeRawUnsafe(`CREATE TABLE "Task" (
        "id" SERIAL PRIMARY KEY, "projectId" INT NOT NULL, "title" TEXT NOT NULL, "done" BOOLEAN NOT NULL,
        "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL,
        "number" INT NOT NULL DEFAULT 0, "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
        "position" DOUBLE PRECISION NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

      await tx.$executeRawUnsafe(`INSERT INTO "Project" ("id","groupName") VALUES (1,'Group Alpha'),(2,'Team'),(3,'No Tasks Yet'),(4,'FairTraze AI')`);
      // Project 1 is inserted out of creation order on purpose (ids do not match createdAt order).
      await tx.$executeRawUnsafe(`INSERT INTO "Task" ("projectId","title","done","completedAt","createdAt") VALUES
        (1,'third',false,NULL,'2026-10-03 10:00:00'),
        (1,'first',true,'2026-10-05 09:00:00','2026-10-01 10:00:00'),
        (1,'second',false,NULL,'2026-10-02 10:00:00'),
        (1,'fourth',true,'2026-10-06 09:00:00','2026-10-04 10:00:00'),
        (2,'solo',false,NULL,'2026-10-01 10:00:00'),
        (4,'fa-1',false,NULL,'2026-10-01 10:00:00')`);

      for (const statement of statements) await tx.$executeRawUnsafe(statement);

      const tasks = await tx.$queryRawUnsafe<{ title: string; number: number; status: string; position: number; updatedAt: Date; completedAt: Date | null; createdAt: Date }[]>(
        `SELECT "title","number","status","position","updatedAt","completedAt","createdAt" FROM "Task" WHERE "projectId" = 1 ORDER BY "number"`,
      );
      // Numbers follow creation order: first, second, third, fourth.
      expect(tasks.map((t) => [t.title, t.number])).toEqual([["first", 1], ["second", 2], ["third", 3], ["fourth", 4]]);
      // done -> DONE, everything else -> TODO.
      expect(tasks.map((t) => t.status)).toEqual(["DONE", "TODO", "TODO", "DONE"]);
      // Order inside each column follows creation order, 1024 apart.
      const byTitle = Object.fromEntries(tasks.map((t) => [t.title, t.position]));
      expect(byTitle).toEqual({ first: 1024, fourth: 2048, second: 1024, third: 2048 });
      // updatedAt = completedAt when present, else createdAt.
      for (const t of tasks) expect(t.updatedAt.getTime()).toBe((t.completedAt ?? t.createdAt).getTime());

      const projects = await tx.$queryRawUnsafe<{ id: number; taskKey: string | null; nextTaskNumber: number }[]>(
        `SELECT "id","taskKey","nextTaskNumber" FROM "Project" ORDER BY "id"`,
      );
      expect(projects).toEqual([
        { id: 1, taskKey: "GA", nextTaskNumber: 5 },
        { id: 2, taskKey: "TASK", nextTaskNumber: 2 },   // "Team" has no usable initials
        { id: 3, taskKey: null, nextTaskNumber: 1 },     // no tasks: key is derived when the first is created
        { id: 4, taskKey: "FA", nextTaskNumber: 2 },
      ]);
      // The SQL rule and the TypeScript rule agree.
      expect(projects[0]!.taskKey).toBe(deriveTaskKey("Group Alpha"));
      expect(projects[1]!.taskKey).toBe(deriveTaskKey("Team"));
      expect(projects[3]!.taskKey).toBe(deriveTaskKey("FairTraze AI"));

      await tx.$executeRawUnsafe(`DROP SCHEMA ${SCHEMA} CASCADE`);
    }, { timeout: 55000, maxWait: 20000 });
  });
});

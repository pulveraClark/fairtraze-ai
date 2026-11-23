import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";

// Existing tasks must keep their creator and assignee as watchers after migration
// 20261019100100_task_details_tables. Runs the BACKFILL statements (the exact text) against
// legacy-shaped rows in a throwaway schema, so no real table is touched.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.resolve(__dirname, "../prisma/migrations/20261019100100_task_details_tables/migration.sql"), "utf8",
);
// Drop the rest of the marker line itself (": existing tasks are watched ...").
const backfill = migration.split("-- Backfill")[1]!.split("\n").slice(1).join("\n");
const statements = backfill.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);

const SCHEMA = "task_watch_backfill_test";

describe("task watchers migration backfill", () => {
  it("has the statements we expect to run", () => {
    expect(statements).toHaveLength(2);
  });

  it("adds each task's creator and assignee once", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await tx.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${SCHEMA}`);
      await tx.$executeRawUnsafe(`CREATE TABLE "Task" ("id" INT PRIMARY KEY, "createdByUserId" INT NOT NULL, "assignedToUserId" INT)`);
      await tx.$executeRawUnsafe(`CREATE TABLE "TaskWatcher" ("taskId" INT NOT NULL, "userId" INT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("taskId","userId"))`);
      await tx.$executeRawUnsafe(`INSERT INTO "Task" VALUES (1,10,NULL),(2,10,10),(3,10,11)`);

      for (const statement of statements) await tx.$executeRawUnsafe(statement);

      const rows = await tx.$queryRawUnsafe<{ taskId: number; userId: number }[]>(
        `SELECT "taskId","userId" FROM "TaskWatcher" ORDER BY "taskId","userId"`,
      );
      expect(rows.map((r) => [r.taskId, r.userId])).toEqual([[1, 10], [2, 10], [3, 10], [3, 11]]);
      await tx.$executeRawUnsafe(`DROP SCHEMA ${SCHEMA} CASCADE`);
    }, { timeout: 55000, maxWait: 20000 });
  });
});

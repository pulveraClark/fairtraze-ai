-- Tasks board, step 1: status / priority / due date / order / per-group number / version on Task,
-- plus the per-group key + counter on Project. Existing tasks survive: status comes from `done`,
-- numbers and order come from creation order. `done` is kept (synced from status by the app)
-- until a later cleanup migration drops it.

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "taskKey" TEXT,
ADD COLUMN "nextTaskNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "dueDate" DATE,
ADD COLUMN "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "milestoneId" INTEGER,
ADD COLUMN "docHeading" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- BEGIN BACKFILL (the same statements are exercised by server/test/taskBackfill.test.ts)
-- Status from the legacy done flag.
UPDATE "Task" SET "status" = CASE WHEN "done" THEN 'DONE'::"TaskStatus" ELSE 'TODO'::"TaskStatus" END;

-- Per-group number, in creation order.
UPDATE "Task" t SET "number" = r.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt", "id") AS rn
  FROM "Task"
) r
WHERE t."id" = r."id";

-- Order inside each column: creation order, spaced 1024 apart.
UPDATE "Task" t SET "position" = r.rn * 1024
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId", "status" ORDER BY "createdAt", "id") AS rn
  FROM "Task"
) r
WHERE t."id" = r."id";

-- updatedAt: last meaningful moment we know of.
UPDATE "Task" SET "updatedAt" = COALESCE("completedAt", "createdAt");

-- Counter: next free number per group that already has tasks.
UPDATE "Project" p SET "nextTaskNumber" = m.max_number + 1
FROM (SELECT "projectId", MAX("number") AS max_number FROM "Task" GROUP BY "projectId") m
WHERE p."id" = m."projectId";

-- Key for groups that already have tasks: initials of the group name (max 4 letters/digits),
-- or TASK when that is not a usable key (same rule as server/src/lib/taskKey.ts).
UPDATE "Project" p SET "taskKey" = CASE
  WHEN k.initials ~ '^[A-Z][A-Z0-9]{1,4}$' THEN k.initials
  ELSE 'TASK'
END
FROM (
  SELECT pr."id" AS id,
         COALESCE(
           LEFT(
             (SELECT STRING_AGG(UPPER(LEFT(w.word, 1)), '' ORDER BY w.ord)
                FROM REGEXP_SPLIT_TO_TABLE(REGEXP_REPLACE(pr."groupName", '[^A-Za-z0-9 ]', '', 'g'), ' +')
                     WITH ORDINALITY AS w(word, ord)
               WHERE w.word <> ''),
             4),
           ''
         ) AS initials
  FROM "Project" pr
  WHERE EXISTS (SELECT 1 FROM "Task" t WHERE t."projectId" = pr."id")
) k
WHERE p."id" = k.id;
-- END BACKFILL

-- The number default only existed to let the column be added; the app always supplies it.
ALTER TABLE "Task" ALTER COLUMN "number" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_number_key" ON "Task"("projectId", "number");

-- CreateIndex
CREATE INDEX "Task_projectId_status_position_idx" ON "Task"("projectId", "status", "position");

-- CreateIndex
CREATE INDEX "Task_assignedToUserId_idx" ON "Task"("assignedToUserId");

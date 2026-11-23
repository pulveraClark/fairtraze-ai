-- Scoring settings move from the group (Project) to the project (Assignment).
-- Additive: the legacy Project columns are kept, no longer read or written.

-- AlterTable
ALTER TABLE "Assignment"
  ADD COLUMN "weightCommits"           DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  ADD COLUMN "weightLines"             DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  ADD COLUMN "weightActiveDays"        DOUBLE PRECISION NOT NULL DEFAULT 0.2,
  ADD COLUMN "freeRiderThreshold"      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "overloadThreshold"       DOUBLE PRECISION NOT NULL DEFAULT 1.75,
  ADD COLUMN "deadlineDrivenThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  ADD COLUMN "weightGithub"            DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "weightDocs"              DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- Backfill rule (server/test/assignmentScoringConfig.test.ts executes the statements between
-- the BACKFILL markers, so keep each statement free of inner semicolons):
--   * every group in an assignment has identical values -> the assignment takes them
--   * groups differ (conflict) -> the assignment keeps the defaults added above
--   * assignment has no groups -> defaults
-- BACKFILL-START
UPDATE "Assignment" a
SET "weightCommits"           = u."weightCommits",
    "weightLines"             = u."weightLines",
    "weightActiveDays"        = u."weightActiveDays",
    "freeRiderThreshold"      = u."freeRiderThreshold",
    "overloadThreshold"       = u."overloadThreshold",
    "deadlineDrivenThreshold" = u."deadlineDrivenThreshold",
    "weightGithub"            = u."weightGithub",
    "weightDocs"              = u."weightDocs"
FROM (
  SELECT "assignmentId",
         MIN("weightCommits")           AS "weightCommits",
         MIN("weightLines")             AS "weightLines",
         MIN("weightActiveDays")        AS "weightActiveDays",
         MIN("freeRiderThreshold")      AS "freeRiderThreshold",
         MIN("overloadThreshold")       AS "overloadThreshold",
         MIN("deadlineDrivenThreshold") AS "deadlineDrivenThreshold",
         MIN("weightGithub")            AS "weightGithub",
         MIN("weightDocs")              AS "weightDocs"
  FROM "Project"
  WHERE "assignmentId" IS NOT NULL
  GROUP BY "assignmentId"
  HAVING COUNT(DISTINCT concat_ws('|', "weightCommits", "weightLines", "weightActiveDays",
         "freeRiderThreshold", "overloadThreshold", "deadlineDrivenThreshold",
         "weightGithub", "weightDocs")) = 1
) u
WHERE a."id" = u."assignmentId";

-- Groups that already have a report and were scored with values that now differ from their
-- assignment's (only possible in conflicting assignments) are marked stale so the instructor
-- sees they need a re-analyze.
UPDATE "Project" p
SET "scoringConfigChangedAt" = COALESCE(p."scoringConfigChangedAt", now())
FROM "Assignment" a
WHERE p."assignmentId" = a."id"
  AND (p."weightCommits", p."weightLines", p."weightActiveDays", p."freeRiderThreshold",
       p."overloadThreshold", p."deadlineDrivenThreshold", p."weightGithub", p."weightDocs")
      IS DISTINCT FROM
      (a."weightCommits", a."weightLines", a."weightActiveDays", a."freeRiderThreshold",
       a."overloadThreshold", a."deadlineDrivenThreshold", a."weightGithub", a."weightDocs")
  AND EXISTS (SELECT 1 FROM "Report" r WHERE r."projectId" = p."id");
-- BACKFILL-END

-- List conflicting assignments in the migration output (they were left on the defaults).
DO $$
DECLARE
  r RECORD;
  n INTEGER := 0;
BEGIN
  FOR r IN
    SELECT "assignmentId", COUNT(*) AS groups
    FROM "Project"
    WHERE "assignmentId" IS NOT NULL
    GROUP BY "assignmentId"
    HAVING COUNT(DISTINCT concat_ws('|', "weightCommits", "weightLines", "weightActiveDays",
           "freeRiderThreshold", "overloadThreshold", "deadlineDrivenThreshold",
           "weightGithub", "weightDocs")) > 1
    ORDER BY "assignmentId"
  LOOP
    RAISE NOTICE 'scoring-config CONFLICT: assignment % (% groups) set to defaults', r."assignmentId", r.groups;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'scoring-config backfill: % conflicting assignment(s)', n;
END $$;

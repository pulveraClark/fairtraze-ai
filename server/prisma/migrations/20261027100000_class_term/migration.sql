-- School term for a class section. An EDP code is a per-semester identifier: the same code may return
-- next term but never twice in one, across ALL instructors (empty codes are ignored).
CREATE TYPE "ClassSemester" AS ENUM ('FIRST', 'SECOND', 'SUMMER');

ALTER TABLE "ClassSection"
  ADD COLUMN "schoolYear" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "semester" "ClassSemester" NOT NULL DEFAULT 'FIRST';

-- Backfill from the created date in Asia/Manila (same rule as shared/src/schoolTerm.ts termOf):
-- Aug-Dec = 1st semester of year-(year+1); Jan-May = 2nd semester and Jun-Jul = Summer of (year-1)-year.
UPDATE "ClassSection" c
SET "schoolYear" = CASE WHEN d.m >= 8 THEN d.y || '-' || (d.y + 1) ELSE (d.y - 1) || '-' || d.y END,
    "semester"   = (CASE WHEN d.m >= 8 THEN 'FIRST' WHEN d.m <= 5 THEN 'SECOND' ELSE 'SUMMER' END)::"ClassSemester"
FROM (
  SELECT id,
         date_part('year',  local_at)::int AS y,
         date_part('month', local_at)::int AS m
  FROM (
    SELECT id, ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila' AS local_at FROM "ClassSection"
  ) t
) d
WHERE c.id = d.id;

-- Was unique per instructor; now unique per term across everyone.
DROP INDEX "ClassSection_instructorId_edpCode_key";
CREATE UNIQUE INDEX "ClassSection_edp_term_key" ON "ClassSection"("edpCode", "schoolYear", "semester") WHERE "edpCode" <> '';

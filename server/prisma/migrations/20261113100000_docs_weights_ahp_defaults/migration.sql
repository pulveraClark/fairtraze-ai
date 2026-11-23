-- Expert-survey (AHP) defaults. Docs weights become per-project settings.
-- New columns take the new defaults for every existing assignment.

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "docsWeightActiveDays" DOUBLE PRECISION NOT NULL DEFAULT 0.33,
ADD COLUMN     "docsWeightRetainedText" DOUBLE PRECISION NOT NULL DEFAULT 0.37,
ADD COLUMN     "docsWeightSessions" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
ALTER COLUMN "weightGithub" SET DEFAULT 0.55,
ALTER COLUMN "weightDocs" SET DEFAULT 0.45;

-- Data: only assignments whose blend is still exactly the old default (0.5 / 0.5) move to the new
-- default (0.55 / 0.45). Customised blends are left untouched. Does not mark any group stale: the
-- rules-version bump already makes every older report show as outdated.
UPDATE "Assignment" SET "weightGithub" = 0.55, "weightDocs" = 0.45
WHERE "weightGithub" = 0.5 AND "weightDocs" = 0.5;

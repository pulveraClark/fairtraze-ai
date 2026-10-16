-- Paper sizes get their standard names and custom margins arrive. Layout only: shared by all
-- collaborators, never part of the Yjs document, never read by scoring. One migration for both:
--   * pageSize: SHORT -> LETTER (8.5 x 11 in), LONG -> LEGAL (now 8.5 x 14 in; the old Long was 13 in),
--     A4 unchanged; the column default becomes LETTER.
--   * marginTop/Bottom/Left/Right in inches, backfilled from the existing preset. marginPreset also
--     accepts CUSTOM (a plain text column, so no enum change is needed).
-- COLLAB_SCHEMA_VERSION is unchanged: nothing here touches the Yjs document.

-- AlterTable
ALTER TABLE "Document"
  ADD COLUMN "marginTop"    DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "marginBottom" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "marginLeft"   DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "marginRight"  DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Backfill from the presets (NORMAL is the 1 in default above).
UPDATE "Document" SET "marginTop" = 0.5, "marginBottom" = 0.5, "marginLeft" = 0.5, "marginRight" = 0.5 WHERE "marginPreset" = 'NARROW';
UPDATE "Document" SET "marginLeft" = 2, "marginRight" = 2 WHERE "marginPreset" = 'WIDE';

-- Paper rename.
UPDATE "Document" SET "pageSize" = 'LETTER' WHERE "pageSize" = 'SHORT';
UPDATE "Document" SET "pageSize" = 'LEGAL' WHERE "pageSize" = 'LONG';
ALTER TABLE "Document" ALTER COLUMN "pageSize" SET DEFAULT 'LETTER';

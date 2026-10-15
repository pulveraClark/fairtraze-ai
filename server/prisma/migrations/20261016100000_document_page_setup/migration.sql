-- Page setup (orientation, margins) and plain-text header/footer slots for FairTraze Docs.
-- Layout only: shared by all collaborators, never part of the Yjs document, never read by scoring.
-- Defaults reproduce the previous behaviour (portrait, 1in margins, no header or footer).

-- AlterTable
ALTER TABLE "Document"
  ADD COLUMN "orientation"  TEXT NOT NULL DEFAULT 'PORTRAIT',
  ADD COLUMN "marginPreset" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "headerLeft"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN "headerCenter" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "headerRight"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN "footerLeft"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN "footerCenter" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "footerRight"  TEXT NOT NULL DEFAULT '';

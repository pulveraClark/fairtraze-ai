-- FairTraze Docs page view: per-document paper size shared by all collaborators.
-- Additive and non-breaking: existing rows take the default 'SHORT' (8.5 x 11 in).
-- Layout only; not read by scoring and not part of the Yjs document.

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "pageSize" TEXT NOT NULL DEFAULT 'SHORT';

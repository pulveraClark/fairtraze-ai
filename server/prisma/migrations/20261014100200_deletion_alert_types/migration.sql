-- AlterEnum (kept in its own migration: new enum values cannot be used in the
-- same transaction that adds them). IF NOT EXISTS keeps a manual apply harmless.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DELETION_REQUESTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DELETION_APPROVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DELETION_REJECTED';

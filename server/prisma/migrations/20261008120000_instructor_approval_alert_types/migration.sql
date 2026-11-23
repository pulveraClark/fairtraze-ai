-- AlterEnum (kept in its own migration: new enum values cannot be used in the
-- same transaction that adds them). IF NOT EXISTS makes a manual apply followed
-- by a later `migrate deploy` a harmless no-op.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'INSTRUCTOR_APPROVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'INSTRUCTOR_REJECTED';

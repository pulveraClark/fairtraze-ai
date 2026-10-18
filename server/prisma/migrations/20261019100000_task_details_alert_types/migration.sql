-- Task details (phase 4): notification types for @mentions, comments and status changes.
-- Kept in its own migration: new enum values cannot be used in the same transaction that adds them.
-- IF NOT EXISTS keeps a manual apply harmless.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_MENTIONED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_COMMENTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_STATUS_CHANGED';

-- Tasks board phase 6: notification types for "moved to In review" (to the leader) and the due-date
-- reminders. Kept in its own migration: new enum values cannot be used in the same transaction that adds
-- them. IF NOT EXISTS keeps a manual apply harmless.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_IN_REVIEW';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_DUE_SOON';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'TASK_OVERDUE';

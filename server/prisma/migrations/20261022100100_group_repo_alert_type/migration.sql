-- Notification type for "the group's GitHub repository was linked or changed". Kept in its own migration:
-- new enum values cannot be used in the same transaction that adds them. IF NOT EXISTS keeps a manual apply harmless.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'GROUP_REPO_CHANGED';

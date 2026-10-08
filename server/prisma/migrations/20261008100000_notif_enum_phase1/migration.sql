-- AlterEnum (kept in its own migration: new enum values cannot be used in the
-- same transaction that adds them)
ALTER TYPE "AlertType" ADD VALUE 'JOIN_REQUEST_RECEIVED';
ALTER TYPE "AlertType" ADD VALUE 'JOIN_REQUEST_ACCEPTED';
ALTER TYPE "AlertType" ADD VALUE 'JOIN_REQUEST_DECLINED';
ALTER TYPE "AlertType" ADD VALUE 'TASK_ASSIGNED';
ALTER TYPE "AlertType" ADD VALUE 'DISPUTE_RESPONDED';
ALTER TYPE "AlertType" ADD VALUE 'ACCOUNT_LOCKED';

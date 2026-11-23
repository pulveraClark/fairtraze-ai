-- AlterTable: optional profile photo, all nullable (additive, safe to apply before deploy)
ALTER TABLE "User" ADD COLUMN "avatarData" BYTEA,
ADD COLUMN "avatarMime" TEXT,
ADD COLUMN "avatarUpdatedAt" TIMESTAMP(3);

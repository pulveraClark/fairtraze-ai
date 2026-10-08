-- CreateEnum
CREATE TYPE "InstructorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: additive. DEFAULT 'APPROVED' backfills every existing user
-- (existing instructors, students, admins, seed data) as approved.
ALTER TABLE "User"
  ADD COLUMN "instructorStatus" "InstructorStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "approvalReviewedAt" TIMESTAMP(3),
  ADD COLUMN "approvalReviewedById" INTEGER;

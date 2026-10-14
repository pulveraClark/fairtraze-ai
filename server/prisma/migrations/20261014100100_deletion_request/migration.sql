-- Account erasure requests, reviewed by an admin.
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "DeletionRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" INTEGER,
    "reviewNote" TEXT,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletionRequest_status_createdAt_idx" ON "DeletionRequest"("status", "createdAt");
CREATE INDEX "DeletionRequest_userId_idx" ON "DeletionRequest"("userId");

ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

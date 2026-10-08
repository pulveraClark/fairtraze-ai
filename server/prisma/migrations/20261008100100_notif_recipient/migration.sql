-- Relax NOT NULLs (non-instructor notifications have no instructor / project / team health).
-- No column is dropped or rewritten; existing rows keep their values.
ALTER TABLE "Alert" ALTER COLUMN "instructorId" DROP NOT NULL;
ALTER TABLE "Alert" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "Alert" ALTER COLUMN "teamHealth" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "recipientId" INTEGER,
ADD COLUMN "link" TEXT,
ADD COLUMN "refType" TEXT,
ADD COLUMN "refId" INTEGER;

-- Backfill existing rows (instructorId is already a valid User FK)
UPDATE "Alert" SET "recipientId" = "instructorId" WHERE "recipientId" IS NULL;
UPDATE "Alert"
SET "link" = CASE WHEN "type" = 'DISPUTE_FILED' THEN '/disputes'
                  ELSE '/project/' || "projectId" END
WHERE "link" IS NULL;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Alert_recipientId_read_createdAt_idx" ON "Alert"("recipientId", "read", "createdAt");

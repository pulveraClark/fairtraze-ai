-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'PDF');

-- AlterTable: optional project brief text (additive, nullable)
ALTER TABLE "Assignment" ADD COLUMN "description" TEXT;

-- CreateTable
CREATE TABLE "ProjectAttachment" (
    "id" SERIAL NOT NULL,
    "assignmentId" INTEGER NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectAttachment_assignmentId_order_idx" ON "ProjectAttachment"("assignmentId", "order");

-- AddForeignKey
ALTER TABLE "ProjectAttachment" ADD CONSTRAINT "ProjectAttachment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

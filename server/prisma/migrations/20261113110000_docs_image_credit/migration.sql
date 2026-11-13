-- Image credit in the Docs writing score: per-project image limit and the image registry.
-- Existing assignments take the default limit of 5. NULL means "No limit".

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "docsImageLimit" INTEGER DEFAULT 5;

-- CreateTable
CREATE TABLE "DocumentImage" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "firstInsertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentImage_documentId_contentHash_key" ON "DocumentImage"("documentId", "contentHash");

-- AddForeignKey
ALTER TABLE "DocumentImage" ADD CONSTRAINT "DocumentImage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

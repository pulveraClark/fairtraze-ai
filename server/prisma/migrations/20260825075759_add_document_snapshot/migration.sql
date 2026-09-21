-- CreateTable
CREATE TABLE "DocumentSnapshot" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "reportId" INTEGER,
    "yjsState" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSnapshot_documentId_createdAt_idx" ON "DocumentSnapshot"("documentId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSnapshot" ADD CONSTRAINT "DocumentSnapshot_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

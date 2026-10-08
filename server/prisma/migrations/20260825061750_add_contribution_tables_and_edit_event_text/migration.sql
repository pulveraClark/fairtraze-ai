-- AlterTable
ALTER TABLE "EditEvent" ADD COLUMN     "deletedText" TEXT,
ADD COLUMN     "insertedText" TEXT;

-- CreateTable
CREATE TABLE "DocumentContribution" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "reportId" INTEGER NOT NULL,
    "netRetainedChars" INTEGER NOT NULL,
    "weightedRetainedChars" DOUBLE PRECISION NOT NULL,
    "effectiveRetainedChars" DOUBLE PRECISION NOT NULL,
    "totalCharsInserted" INTEGER NOT NULL,
    "totalCharsDeleted" INTEGER NOT NULL,
    "selfChurnRatio" DOUBLE PRECISION NOT NULL,
    "editSessionCount" INTEGER NOT NULL,
    "activeEditingDays" INTEGER NOT NULL,
    "lastPhaseRatio" DOUBLE PRECISION NOT NULL,
    "retainedTextShare" DOUBLE PRECISION NOT NULL,
    "sessionShare" DOUBLE PRECISION NOT NULL,
    "activeDaysShare" DOUBLE PRECISION NOT NULL,
    "documentContributionShare" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombinedContribution" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "githubContributionShare" DOUBLE PRECISION NOT NULL,
    "documentContributionShare" DOUBLE PRECISION NOT NULL,
    "wGitHub" DOUBLE PRECISION NOT NULL,
    "wDocs" DOUBLE PRECISION NOT NULL,
    "combinedContributionShare" DOUBLE PRECISION NOT NULL,
    "flags" TEXT NOT NULL,
    "mismatchNotes" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CombinedContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentContribution_reportId_idx" ON "DocumentContribution"("reportId");

-- CreateIndex
CREATE INDEX "CombinedContribution_reportId_idx" ON "CombinedContribution"("reportId");

-- AddForeignKey
ALTER TABLE "DocumentContribution" ADD CONSTRAINT "DocumentContribution_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentContribution" ADD CONSTRAINT "DocumentContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentContribution" ADD CONSTRAINT "DocumentContribution_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinedContribution" ADD CONSTRAINT "CombinedContribution_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombinedContribution" ADD CONSTRAINT "CombinedContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

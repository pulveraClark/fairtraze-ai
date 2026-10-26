-- AI review (member work summaries, brief check). Additive only.
CREATE TYPE "AiReviewKind" AS ENUM ('MEMBER_SUMMARIES', 'BRIEF_COMPARISON');
CREATE TYPE "AiReviewStatus" AS ENUM ('OK', 'PARTIAL', 'FAILED', 'SKIPPED');

ALTER TABLE "ClassSection" ADD COLUMN "aiReviewEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "AiCommitDigest" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sha" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "authorLogin" TEXT,
    "summary" TEXT NOT NULL,
    "files" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCommitDigest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiReportReview" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "kind" "AiReviewKind" NOT NULL,
    "status" "AiReviewStatus" NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "briefHash" TEXT,
    "content" JSONB NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiReportReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCommitDigest_projectId_sha_promptVersion_key" ON "AiCommitDigest"("projectId", "sha", "promptVersion");
CREATE UNIQUE INDEX "AiReportReview_reportId_kind_key" ON "AiReportReview"("reportId", "kind");

ALTER TABLE "AiCommitDigest" ADD CONSTRAINT "AiCommitDigest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiReportReview" ADD CONSTRAINT "AiReportReview_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

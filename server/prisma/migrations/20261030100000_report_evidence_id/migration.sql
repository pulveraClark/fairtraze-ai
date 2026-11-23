-- Report ID for the student Contribution Evidence Report. Additive only; no backfill.
CREATE TABLE "ReportEvidenceId" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "reportId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportEvidenceId_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportEvidenceId_code_key" ON "ReportEvidenceId"("code");
CREATE UNIQUE INDEX "ReportEvidenceId_reportId_key" ON "ReportEvidenceId"("reportId");
CREATE INDEX "ReportEvidenceId_projectId_idx" ON "ReportEvidenceId"("projectId");

ALTER TABLE "ReportEvidenceId" ADD CONSTRAINT "ReportEvidenceId_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportEvidenceId" ADD CONSTRAINT "ReportEvidenceId_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

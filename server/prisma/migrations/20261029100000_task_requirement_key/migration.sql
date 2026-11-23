-- Adds a nullable column and an index only. No backfill; existing tasks stay NULL.
ALTER TABLE "Task" ADD COLUMN "requirementKey" TEXT;

CREATE INDEX "Task_projectId_requirementKey_idx" ON "Task"("projectId", "requirementKey");

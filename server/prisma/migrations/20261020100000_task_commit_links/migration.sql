-- Tasks board phase 5: commit linking and key aliases. Planning data only.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "commitsRefreshedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TaskKeyAlias" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskKeyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCommitLink" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "repo" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorLogin" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCommitLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskKeyAlias_projectId_key_key" ON "TaskKeyAlias"("projectId", "key");
CREATE UNIQUE INDEX "TaskCommitLink_taskId_sha_key" ON "TaskCommitLink"("taskId", "sha");
CREATE INDEX "TaskCommitLink_taskId_committedAt_idx" ON "TaskCommitLink"("taskId", "committedAt");

-- AddForeignKey
ALTER TABLE "TaskKeyAlias" ADD CONSTRAINT "TaskKeyAlias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskCommitLink" ADD CONSTRAINT "TaskCommitLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

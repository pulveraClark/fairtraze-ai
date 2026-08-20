-- CreateTable
CREATE TABLE "CachedCommitDiff" (
    "id" SERIAL NOT NULL,
    "repo" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "files" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CachedCommitDiff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CachedCommitDiff_repo_sha_key" ON "CachedCommitDiff"("repo", "sha");

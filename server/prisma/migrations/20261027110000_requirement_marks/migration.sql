-- "We have this" marks on project-instructions requirements the AI could not confirm. Context only: never read by
-- scoring, flags, Gini, team health or any AI prompt. Deleted with the project. Additive.
-- CreateEnum
CREATE TYPE "RequirementMarkRole" AS ENUM ('LEADER', 'INSTRUCTOR');

-- CreateEnum
CREATE TYPE "RequirementMarkStatus" AS ENUM ('LEADER_CLAIM', 'LEADER_CLAIM_DECLINED', 'INSTRUCTOR_CONFIRMED');

-- CreateTable
CREATE TABLE "RequirementMark" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "requirementText" TEXT NOT NULL,
    "sourceQuote" TEXT,
    "sourceFile" TEXT,
    "sourcePage" INTEGER,
    "role" "RequirementMarkRole" NOT NULL,
    "status" "RequirementMarkStatus" NOT NULL,
    "markedById" INTEGER NOT NULL,
    "note" TEXT,
    "imageData" BYTEA,
    "imageMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequirementMark_projectId_idx" ON "RequirementMark"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementMark_projectId_requirementKey_role_key" ON "RequirementMark"("projectId", "requirementKey", "role");

-- AddForeignKey
ALTER TABLE "RequirementMark" ADD CONSTRAINT "RequirementMark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementMark" ADD CONSTRAINT "RequirementMark_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


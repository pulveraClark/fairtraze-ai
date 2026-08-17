-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'INSTRUCTOR', 'STUDENT');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('GITHUB', 'EDITOR', 'COMBINED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ClassType" AS ENUM ('LECTURE', 'LABORATORY');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('HIGH_RISK', 'MODERATE_RISK', 'MEMBER_FLAGGED', 'DISPUTE_FILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "EditEventType" AS ENUM ('INSERT', 'DELETE');

-- CreateEnum
CREATE TYPE "EditType" AS ENUM ('SUBSTANTIVE', 'REVISION', 'FORMATTING', 'TRIVIAL');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemRole" "SystemRole" NOT NULL DEFAULT 'STUDENT',
    "githubUsername" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSection" (
    "id" SERIAL NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "course" TEXT NOT NULL DEFAULT 'BSIT',
    "edpCode" TEXT NOT NULL DEFAULT '',
    "type" "ClassType" NOT NULL DEFAULT 'LECTURE',
    "joinCode" TEXT,
    "instructorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassEnrollment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "classSectionId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" SERIAL NOT NULL,
    "classSectionId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "maxGroupSize" INTEGER NOT NULL DEFAULT 5,
    "sourceType" "SourceType" NOT NULL DEFAULT 'GITHUB',
    "joinCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "functionalRoles" TEXT NOT NULL DEFAULT '["DEVELOPER"]',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "assignmentLabel" TEXT NOT NULL DEFAULT '',
    "assignmentId" INTEGER,
    "membershipChangedAt" TIMESTAMP(3),
    "weightCommits" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "weightLines" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "weightActiveDays" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "freeRiderThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "overloadThreshold" DOUBLE PRECISION NOT NULL DEFAULT 1.75,
    "deadlineDrivenThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "weightGithub" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "weightDocs" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "scoringConfigChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "studentName" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gini" DOUBLE PRECISION,
    "teamHealth" TEXT,
    "content" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "instructorId" INTEGER NOT NULL,
    "type" "AlertType" NOT NULL,
    "message" TEXT NOT NULL,
    "teamHealth" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "studentUserId" INTEGER NOT NULL,
    "memberName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "instructorResponse" TEXT,
    "disputedFlags" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupJoinRequest" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleSuggestion" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "suggestedRoles" TEXT NOT NULL,
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "RoleSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
    "yjsState" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditEvent" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventType" "EditEventType" NOT NULL,
    "position" INTEGER NOT NULL,
    "length" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editType" "EditType",

    CONSTRAINT "EditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditSession" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "characterCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EditSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSection_joinCode_key" ON "ClassSection"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSection_instructorId_edpCode_key" ON "ClassSection"("instructorId", "edpCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEnrollment_userId_classSectionId_key" ON "ClassEnrollment"("userId", "classSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_joinCode_key" ON "Assignment"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_userId_projectId_key" ON "GroupMembership"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_groupId_key" ON "Document"("groupId");

-- CreateIndex
CREATE INDEX "EditEvent_documentId_timestamp_idx" ON "EditEvent"("documentId", "timestamp");

-- CreateIndex
CREATE INDEX "EditSession_documentId_userId_idx" ON "EditSession"("documentId", "userId");

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEnrollment" ADD CONSTRAINT "ClassEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassEnrollment" ADD CONSTRAINT "ClassEnrollment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSuggestion" ADD CONSTRAINT "RoleSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleSuggestion" ADD CONSTRAINT "RoleSuggestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditEvent" ADD CONSTRAINT "EditEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditEvent" ADD CONSTRAINT "EditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditSession" ADD CONSTRAINT "EditSession_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditSession" ADD CONSTRAINT "EditSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

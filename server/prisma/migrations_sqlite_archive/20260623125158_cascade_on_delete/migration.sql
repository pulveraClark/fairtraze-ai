-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "instructorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "teamHealth" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alert_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Alert" ("createdAt", "id", "instructorId", "message", "projectId", "read", "teamHealth", "type") SELECT "createdAt", "id", "instructorId", "message", "projectId", "read", "teamHealth", "type" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE TABLE "new_Assignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classSectionId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" DATETIME,
    "maxGroupSize" INTEGER NOT NULL DEFAULT 5,
    "sourceType" TEXT NOT NULL DEFAULT 'GITHUB',
    "joinCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Assignment" ("classSectionId", "createdAt", "deadline", "id", "joinCode", "maxGroupSize", "sourceType", "title") SELECT "classSectionId", "createdAt", "deadline", "id", "joinCode", "maxGroupSize", "sourceType", "title" FROM "Assignment";
DROP TABLE "Assignment";
ALTER TABLE "new_Assignment" RENAME TO "Assignment";
CREATE UNIQUE INDEX "Assignment_joinCode_key" ON "Assignment"("joinCode");
CREATE TABLE "new_GroupMembership" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GroupMembership" ("id", "joinedAt", "projectId", "role", "userId") SELECT "id", "joinedAt", "projectId", "role", "userId" FROM "GroupMembership";
DROP TABLE "GroupMembership";
ALTER TABLE "new_GroupMembership" RENAME TO "GroupMembership";
CREATE UNIQUE INDEX "GroupMembership_userId_projectId_key" ON "GroupMembership"("userId", "projectId");
CREATE TABLE "new_Member" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "studentName" TEXT NOT NULL,
    "githubUsername" TEXT NOT NULL,
    CONSTRAINT "Member_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Member" ("githubUsername", "id", "projectId", "studentName") SELECT "githubUsername", "id", "projectId", "studentName" FROM "Member";
DROP TABLE "Member";
ALTER TABLE "new_Member" RENAME TO "Member";
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupName" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "assignmentLabel" TEXT NOT NULL DEFAULT '',
    "assignmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("assignmentId", "assignmentLabel", "createdAt", "groupName", "id", "name", "repoUrl") SELECT "assignmentId", "assignmentLabel", "createdAt", "groupName", "id", "name", "repoUrl" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE TABLE "new_Report" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gini" REAL,
    "teamHealth" TEXT,
    "content" TEXT,
    CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("content", "generatedAt", "gini", "id", "projectId", "teamHealth") SELECT "content", "generatedAt", "gini", "id", "projectId", "teamHealth" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

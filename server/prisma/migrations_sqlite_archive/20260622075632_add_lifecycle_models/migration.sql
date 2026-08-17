-- CreateTable
CREATE TABLE "ClassSection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subjectCode" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "course" TEXT NOT NULL DEFAULT 'BSIT',
    "instructorId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassSection_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classSectionId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "deadline" DATETIME,
    "maxGroupSize" INTEGER NOT NULL DEFAULT 5,
    "sourceType" TEXT NOT NULL DEFAULT 'GITHUB',
    "joinCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Assignment_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "ClassSection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GroupMembership" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GroupMembership_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "groupName" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "assignmentLabel" TEXT NOT NULL DEFAULT '',
    "assignmentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("assignmentLabel", "createdAt", "groupName", "id", "name", "repoUrl") SELECT "assignmentLabel", "createdAt", "groupName", "id", "name", "repoUrl" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ClassSection_instructorId_subjectCode_key" ON "ClassSection"("instructorId", "subjectCode");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_joinCode_key" ON "Assignment"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_userId_projectId_key" ON "GroupMembership"("userId", "projectId");

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
    "membershipChangedAt" DATETIME,
    "weightCommits" REAL NOT NULL DEFAULT 0.4,
    "weightLines" REAL NOT NULL DEFAULT 0.4,
    "weightActiveDays" REAL NOT NULL DEFAULT 0.2,
    "freeRiderThreshold" REAL NOT NULL DEFAULT 0.5,
    "overloadThreshold" REAL NOT NULL DEFAULT 1.75,
    "deadlineDrivenThreshold" REAL NOT NULL DEFAULT 0.6,
    "scoringConfigChangedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("assignmentId", "assignmentLabel", "createdAt", "groupName", "id", "membershipChangedAt", "name", "repoUrl") SELECT "assignmentId", "assignmentLabel", "createdAt", "groupName", "id", "membershipChangedAt", "name", "repoUrl" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

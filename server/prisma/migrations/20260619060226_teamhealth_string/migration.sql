-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Report" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "projectId" INTEGER NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gini" REAL,
    "teamHealth" TEXT,
    "content" TEXT,
    CONSTRAINT "Report_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("content", "generatedAt", "gini", "id", "projectId", "teamHealth") SELECT "content", "generatedAt", "gini", "id", "projectId", "teamHealth" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

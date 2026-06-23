-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassSection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subjectCode" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "course" TEXT NOT NULL DEFAULT 'BSIT',
    "edpCode" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'LECTURE',
    "instructorId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassSection_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClassSection" ("course", "createdAt", "id", "instructorId", "subjectCode", "subjectName") SELECT "course", "createdAt", "id", "instructorId", "subjectCode", "subjectName" FROM "ClassSection";
-- Give existing rows a unique placeholder so the UNIQUE index can be created; seed will overwrite with real values
UPDATE "new_ClassSection" SET "edpCode" = 'LEGACY-' || CAST("id" AS TEXT) WHERE "edpCode" = '';
DROP TABLE "ClassSection";
ALTER TABLE "new_ClassSection" RENAME TO "ClassSection";
CREATE UNIQUE INDEX "ClassSection_instructorId_edpCode_key" ON "ClassSection"("instructorId", "edpCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

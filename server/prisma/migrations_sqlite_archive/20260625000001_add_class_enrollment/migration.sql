-- Add joinCode column to ClassSection (nullable so existing rows are unaffected;
-- seed populates unique values for all existing rows before the app starts)
ALTER TABLE "ClassSection" ADD COLUMN "joinCode" TEXT;

-- Unique index on ClassSection.joinCode (SQLite allows multiple NULLs in UNIQUE indexes)
CREATE UNIQUE INDEX "ClassSection_joinCode_key" ON "ClassSection"("joinCode");

-- Create ClassEnrollment table (student enrolled in a class)
CREATE TABLE "ClassEnrollment" (
    "id"             INTEGER  NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId"         INTEGER  NOT NULL,
    "classSectionId" INTEGER  NOT NULL,
    "joinedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassEnrollment_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClassEnrollment_classSectionId_fkey"
        FOREIGN KEY ("classSectionId") REFERENCES "ClassSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One enrollment per student per class
CREATE UNIQUE INDEX "ClassEnrollment_userId_classSectionId_key"
    ON "ClassEnrollment"("userId", "classSectionId");

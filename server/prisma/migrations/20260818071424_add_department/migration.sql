-- Add Department model and wire it into ClassSection, retiring the free-text `course` field.

-- 1. Create Department table
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- 2. Seed one default department for existing data (all seeded ClassSections are BSIT/CCS)
INSERT INTO "Department" ("name", "code") VALUES ('College of Computer Studies', 'CCS');

-- 3. Add departmentId to ClassSection as nullable first, so existing rows can be backfilled
ALTER TABLE "ClassSection" ADD COLUMN "departmentId" INTEGER;

-- 4. Backfill all existing ClassSection rows to the default department
UPDATE "ClassSection" SET "departmentId" = (SELECT "id" FROM "Department" WHERE "code" = 'CCS' LIMIT 1);

-- 5. Make departmentId required now that every row has a value
ALTER TABLE "ClassSection" ALTER COLUMN "departmentId" SET NOT NULL;

-- 6. Add the foreign key
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Drop the retired free-text course column
ALTER TABLE "ClassSection" DROP COLUMN "course";

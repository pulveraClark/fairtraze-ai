-- CreateEnum
CREATE TYPE "EditSource" AS ENUM ('LIVE', 'IMPORT');

-- AlterTable
ALTER TABLE "EditEvent" ADD COLUMN     "source" "EditSource" NOT NULL DEFAULT 'LIVE';

-- AlterTable
ALTER TABLE "EditSession" ADD COLUMN     "source" "EditSource" NOT NULL DEFAULT 'LIVE';

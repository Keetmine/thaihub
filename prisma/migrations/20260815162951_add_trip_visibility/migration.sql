-- CreateEnum
CREATE TYPE "TripVisibility" AS ENUM ('PRIVATE', 'FRIENDS', 'PUBLIC');

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "visibility" "TripVisibility" NOT NULL DEFAULT 'PRIVATE';


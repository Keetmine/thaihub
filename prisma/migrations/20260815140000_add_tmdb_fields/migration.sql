-- CreateEnum
CREATE TYPE "DramaStatus" AS ENUM ('RETURNING_SERIES', 'PLANNED', 'IN_PRODUCTION', 'ENDED', 'CANCELED', 'PILOT');

-- AlterTable
ALTER TABLE "Performer" ADD COLUMN     "placeOfBirth" TEXT,
ADD COLUMN     "tmdbId" TEXT;

-- AlterTable
ALTER TABLE "Drama" ADD COLUMN     "status" "DramaStatus",
ADD COLUMN     "tmdbId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Performer_tmdbId_key" ON "Performer"("tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "Drama_tmdbId_key" ON "Drama"("tmdbId");

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hideAchievements" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hideFavoritePerformers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hideVisitedPlaces" BOOLEAN NOT NULL DEFAULT false;


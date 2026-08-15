-- AlterTable
ALTER TABLE "Agency" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Drama" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Performer" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "PlaceList" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Drama_slug_key" ON "Drama"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Performer_slug_key" ON "Performer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceList_slug_key" ON "PlaceList"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_slug_key" ON "Trip"("slug");


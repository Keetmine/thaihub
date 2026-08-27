-- AlterTable
ALTER TABLE "Drama" ADD COLUMN     "doramalandUrl" TEXT,
ADD COLUMN     "synopsisRu" TEXT,
ADD COLUMN     "titleRu" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Drama_doramalandUrl_key" ON "Drama"("doramalandUrl");

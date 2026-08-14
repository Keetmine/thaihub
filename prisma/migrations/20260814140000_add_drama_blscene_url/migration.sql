-- AlterTable
ALTER TABLE "Drama" ADD COLUMN "blsceneUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Drama_blsceneUrl_key" ON "Drama"("blsceneUrl");

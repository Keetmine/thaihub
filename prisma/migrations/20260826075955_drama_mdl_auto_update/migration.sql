-- AlterTable
ALTER TABLE "Drama" ADD COLUMN     "mdlAutoUpdate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mdlUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Drama_mdlUrl_key" ON "Drama"("mdlUrl");


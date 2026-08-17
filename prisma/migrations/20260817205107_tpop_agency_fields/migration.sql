-- AlterTable
ALTER TABLE "Album" ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "Performer" ADD COLUMN     "awards" JSONB,
ADD COLUMN     "height" TEXT,
ADD COLUMN     "instruments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mvAppearances" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "occupation" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "references" JSONB,
ADD COLUMN     "soloDebut" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "trivia" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "weight" TEXT;

-- CreateTable
CREATE TABLE "ImportedItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportedItem_createdAt_idx" ON "ImportedItem"("createdAt");

-- AddForeignKey
ALTER TABLE "ImportedItem" ADD CONSTRAINT "ImportedItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;


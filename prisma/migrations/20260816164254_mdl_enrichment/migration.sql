-- AlterTable
ALTER TABLE "Drama" ADD COLUMN     "airedFrom" TIMESTAMP(3),
ADD COLUMN     "airedOn" TEXT,
ADD COLUMN     "airedTo" TIMESTAMP(3),
ADD COLUMN     "alsoKnownAs" TEXT,
ADD COLUMN     "contentRating" TEXT,
ADD COLUMN     "director" TEXT,
ADD COLUMN     "duration" TEXT,
ADD COLUMN     "episodes" INTEGER,
ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mdlScore" DOUBLE PRECISION,
ADD COLUMN     "mdlSyncedAt" TIMESTAMP(3),
ADD COLUMN     "nativeTitle" TEXT,
ADD COLUMN     "screenwriter" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Performer" ADD COLUMN     "alsoKnownAs" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "mdlSyncedAt" TIMESTAMP(3),
ADD COLUMN     "nationality" TEXT;

-- CreateTable
CREATE TABLE "DramaRelation" (
    "id" TEXT NOT NULL,
    "dramaId" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "relation" TEXT,

    CONSTRAINT "DramaRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DramaRelation_dramaId_relatedId_key" ON "DramaRelation"("dramaId", "relatedId");

-- AddForeignKey
ALTER TABLE "DramaRelation" ADD CONSTRAINT "DramaRelation_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DramaRelation" ADD CONSTRAINT "DramaRelation_relatedId_fkey" FOREIGN KEY ("relatedId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE;

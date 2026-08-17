-- AlterTable
ALTER TABLE "EventOccurrence" ADD COLUMN     "hasTime" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "OccurrenceLineup" (
    "occurrenceId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    CONSTRAINT "OccurrenceLineup_pkey" PRIMARY KEY ("occurrenceId","performerId")
);

-- CreateTable
CREATE TABLE "WikiArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WikiArticle_slug_key" ON "WikiArticle"("slug");

-- AddForeignKey
ALTER TABLE "OccurrenceLineup" ADD CONSTRAINT "OccurrenceLineup_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccurrenceLineup" ADD CONSTRAINT "OccurrenceLineup_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


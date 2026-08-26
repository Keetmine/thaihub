-- CreateTable
CREATE TABLE "DramaEpisode" (
    "id" TEXT NOT NULL,
    "dramaId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "airDate" TIMESTAMP(3),
    "title" TEXT,

    CONSTRAINT "DramaEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DramaEpisode_airDate_idx" ON "DramaEpisode"("airDate");

-- CreateIndex
CREATE UNIQUE INDEX "DramaEpisode_dramaId_number_key" ON "DramaEpisode"("dramaId", "number");

-- AddForeignKey
ALTER TABLE "DramaEpisode" ADD CONSTRAINT "DramaEpisode_dramaId_fkey" FOREIGN KEY ("dramaId") REFERENCES "Drama"("id") ON DELETE CASCADE ON UPDATE CASCADE;


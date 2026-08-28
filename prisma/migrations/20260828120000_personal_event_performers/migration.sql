-- CreateTable
CREATE TABLE "TripPersonalEventPerformer" (
    "id" TEXT NOT NULL,
    "personalEventId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    CONSTRAINT "TripPersonalEventPerformer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripPersonalEventPerformer_performerId_idx" ON "TripPersonalEventPerformer"("performerId");

-- CreateIndex
CREATE UNIQUE INDEX "TripPersonalEventPerformer_personalEventId_performerId_key" ON "TripPersonalEventPerformer"("personalEventId", "performerId");

-- AddForeignKey
ALTER TABLE "TripPersonalEventPerformer" ADD CONSTRAINT "TripPersonalEventPerformer_personalEventId_fkey" FOREIGN KEY ("personalEventId") REFERENCES "TripPersonalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPersonalEventPerformer" ADD CONSTRAINT "TripPersonalEventPerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


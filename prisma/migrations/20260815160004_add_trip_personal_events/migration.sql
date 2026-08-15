-- CreateTable
CREATE TABLE "TripPersonalEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPersonalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripPersonalEvent_tripId_idx" ON "TripPersonalEvent"("tripId");

-- AddForeignKey
ALTER TABLE "TripPersonalEvent" ADD CONSTRAINT "TripPersonalEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;


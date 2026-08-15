-- Пересборка EventAttendance: (userId, eventId) -> (userId, occurrenceId);
-- существующие отметки «иду» разворачиваются на все даты события.
ALTER TABLE "EventAttendance" RENAME TO "EventAttendance_old";
ALTER TABLE "EventAttendance_old" RENAME CONSTRAINT "EventAttendance_pkey" TO "EventAttendance_old_pkey";
CREATE TABLE "EventAttendance" (
    "userId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventAttendance_pkey" PRIMARY KEY ("userId", "occurrenceId")
);
INSERT INTO "EventAttendance" ("userId", "occurrenceId", "eventId", "createdAt")
SELECT a."userId", o."id", a."eventId", a."createdAt"
FROM "EventAttendance_old" a
JOIN "EventOccurrence" o ON o."eventId" = a."eventId";
DROP TABLE "EventAttendance_old";
CREATE INDEX "EventAttendance_eventId_idx" ON "EventAttendance"("eventId");
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "TripPersonalEvent" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "PlaceList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "TripVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceListItem" (
    "listId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceListItem_pkey" PRIMARY KEY ("listId","locationId")
);

-- CreateTable
CREATE TABLE "TripPlaceList" (
    "tripId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,

    CONSTRAINT "TripPlaceList_pkey" PRIMARY KEY ("tripId","listId")
);

-- CreateTable
CREATE TABLE "TripPlace" (
    "tripId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPlace_pkey" PRIMARY KEY ("tripId","locationId")
);

-- CreateIndex
CREATE INDEX "PlaceList_userId_idx" ON "PlaceList"("userId");

-- CreateIndex

-- AddForeignKey
ALTER TABLE "TripPersonalEvent" ADD CONSTRAINT "TripPersonalEvent_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceList" ADD CONSTRAINT "PlaceList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceListItem" ADD CONSTRAINT "PlaceListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PlaceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceListItem" ADD CONSTRAINT "PlaceListItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlaceList" ADD CONSTRAINT "TripPlaceList_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlaceList" ADD CONSTRAINT "TripPlaceList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "PlaceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlace" ADD CONSTRAINT "TripPlace_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPlace" ADD CONSTRAINT "TripPlace_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey


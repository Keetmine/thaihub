
-- CreateEnum
CREATE TYPE "LocationCategory" AS ENUM ('CAFE', 'RESTAURANT', 'SHOP', 'MALL', 'HOTEL', 'PHOTO_SPOT', 'LANDMARK', 'PARK', 'TRANSPORT', 'OTHER');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "category" "LocationCategory";

-- CreateTable
CREATE TABLE "LocationLink" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripHotel" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "url" TEXT,
    "fileUrl" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripHotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformerSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformerSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationLink_locationId_idx" ON "LocationLink"("locationId");

-- CreateIndex
CREATE INDEX "TripHotel_tripId_idx" ON "TripHotel"("tripId");

-- CreateIndex
CREATE INDEX "PerformerSeen_userId_idx" ON "PerformerSeen"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformerSeen_userId_performerId_key" ON "PerformerSeen"("userId", "performerId");

-- AddForeignKey
ALTER TABLE "LocationLink" ADD CONSTRAINT "LocationLink_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripHotel" ADD CONSTRAINT "TripHotel_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformerSeen" ADD CONSTRAINT "PerformerSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformerSeen" ADD CONSTRAINT "PerformerSeen_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


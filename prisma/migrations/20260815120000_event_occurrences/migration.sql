-- CreateTable
CREATE TABLE "EventOccurrence" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "EventOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventOccurrence_eventId_idx" ON "EventOccurrence"("eventId");

-- AddForeignKey
ALTER TABLE "EventOccurrence" ADD CONSTRAINT "EventOccurrence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one occurrence per existing Event row, carrying over its
-- current startsAt/endsAt before those columns are dropped below.
INSERT INTO "EventOccurrence" ("id", "eventId", "startsAt", "endsAt")
SELECT gen_random_uuid()::text, "id", "startsAt", "endsAt" FROM "Event";

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "startsAt";
ALTER TABLE "Event" DROP COLUMN "endsAt";

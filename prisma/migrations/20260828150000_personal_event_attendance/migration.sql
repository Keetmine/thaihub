-- CreateTable
CREATE TABLE "TripPersonalEventAttendance" (
    "userId" TEXT NOT NULL,
    "personalEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPersonalEventAttendance_pkey" PRIMARY KEY ("userId","personalEventId")
);

-- CreateIndex
CREATE INDEX "TripPersonalEventAttendance_personalEventId_idx" ON "TripPersonalEventAttendance"("personalEventId");

-- AddForeignKey
ALTER TABLE "TripPersonalEventAttendance" ADD CONSTRAINT "TripPersonalEventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPersonalEventAttendance" ADD CONSTRAINT "TripPersonalEventAttendance_personalEventId_fkey" FOREIGN KEY ("personalEventId") REFERENCES "TripPersonalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Бэкфилл: до отметок «я там буду» посещение подразумевалось фактом
-- создания записи — автору (или владельцу поездки для старых записей
-- без автора) отметка ставится, чтобы уже посчитанное «видел(а)
-- вживую» не откатилось.
INSERT INTO "TripPersonalEventAttendance" ("userId", "personalEventId")
SELECT COALESCE(pe."createdById", t."userId"), pe."id"
FROM "TripPersonalEvent" pe
JOIN "Trip" t ON t."id" = pe."tripId"
ON CONFLICT DO NOTHING;

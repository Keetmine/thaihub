-- CreateTable
CREATE TABLE "EventTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventTicket_userId_idx" ON "EventTicket"("userId");

-- CreateIndex
CREATE INDEX "EventTicket_eventId_idx" ON "EventTicket"("eventId");

-- CreateIndex
CREATE INDEX "EventTicket_occurrenceId_idx" ON "EventTicket"("occurrenceId");

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTicket" ADD CONSTRAINT "EventTicket_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Перенос: билеты с отметок «иду» — в свою таблицу. gen_random_uuid
-- вместо cuid допустим: формат id тут никого не волнует, важна
-- уникальность.
INSERT INTO "EventTicket" ("id", "userId", "eventId", "occurrenceId", "fileUrl", "createdAt")
SELECT gen_random_uuid()::text, "userId", "eventId", "occurrenceId", "ticketUrl", "createdAt"
FROM "EventAttendance"
WHERE "ticketUrl" IS NOT NULL;

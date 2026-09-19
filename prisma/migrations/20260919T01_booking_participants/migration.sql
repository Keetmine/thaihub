-- Участники брони (правка владельца 2026-09-19): «подружка добавила
-- свой самолёт, мы летим вместе, но если я добавлю свой — будет каша
-- из самолётов, хотя рейс один; а если десять человек летит — список
-- самолётов на всю страницу. И чтобы я могла прикреплять свои билеты».
--
-- Бронь (перелёт или отель) одна, а летят/живут в ней несколько
-- участников поездки — у каждого своя строка здесь и, если приложил,
-- свой билет (fileUrl). Общий файл брони (TripBooking.fileUrl) остаётся
-- как был — подтверждение отеля или билет того, кто заводил.
--
-- Бэкфилл: у каждой брони один участник — её автор, а у старых записей
-- без автора — владелец поездки, как их и считали до сих пор.
CREATE TABLE "TripBookingParticipant" (
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripBookingParticipant_pkey" PRIMARY KEY ("bookingId", "userId")
);

CREATE INDEX "TripBookingParticipant_userId_idx" ON "TripBookingParticipant"("userId");

ALTER TABLE "TripBookingParticipant" ADD CONSTRAINT "TripBookingParticipant_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "TripBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripBookingParticipant" ADD CONSTRAINT "TripBookingParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TripBookingParticipant" ("bookingId", "userId")
SELECT b."id", COALESCE(b."createdById", t."userId")
FROM "TripBooking" b
JOIN "Trip" t ON t."id" = b."tripId"
ON CONFLICT DO NOTHING;

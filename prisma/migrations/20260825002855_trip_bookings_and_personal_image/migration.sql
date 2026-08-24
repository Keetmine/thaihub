-- Обобщаем TripHotel до TripBooking (отели + перелёты). Пишем переносом,
-- а не DROP/CREATE: на момент миграции строк не было, но переименование
-- сохранит их, если кто-то успел добавить бронь между дампом и деплоем.
CREATE TYPE "TripBookingKind" AS ENUM ('HOTEL', 'FLIGHT');

ALTER TABLE "TripHotel" RENAME TO "TripBooking";
ALTER TABLE "TripBooking" RENAME COLUMN "checkIn" TO "startAt";
ALTER TABLE "TripBooking" RENAME COLUMN "checkOut" TO "endAt";
ALTER TABLE "TripBooking" ADD COLUMN "kind" "TripBookingKind" NOT NULL DEFAULT 'HOTEL';
ALTER TABLE "TripBooking" ADD COLUMN "fromPlace" TEXT;
ALTER TABLE "TripBooking" ADD COLUMN "toPlace" TEXT;

-- Индекс и первичный ключ переезжают вместе с таблицей, но имена
-- остаются старыми — приводим к тем, что ожидает Prisma.
ALTER INDEX "TripHotel_pkey" RENAME TO "TripBooking_pkey";
ALTER INDEX "TripHotel_tripId_idx" RENAME TO "TripBooking_tripId_idx";

-- Картинка к личному событию поездки.
ALTER TABLE "TripPersonalEvent" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "TripBooking" RENAME CONSTRAINT "TripHotel_tripId_fkey" TO "TripBooking_tripId_fkey";

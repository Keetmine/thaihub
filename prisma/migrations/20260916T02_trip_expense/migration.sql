-- Траты поездки (решение владельца 2026-09-16: «собирать траты»).
--
-- Запись ЛИЧНАЯ: «давай персонально у каждого свои траты». Поэтому
-- никакого `visibility`, как у прочих записей поездки, тут нет — трата
-- видна только своему автору, и это не настройка, а устройство. Делёжки
-- «кто кому должен» тоже нет: владелец её отдельно отменила.
--
-- Сумма — ЦЕЛЫЕ МИНОРНЫЕ ЕДИНИЦЫ (сатанги, копейки, центы), а не
-- дробное число: 0.1 + 0.2 в double даёт 0.30000000000000004, и итог по
-- сотне трат уезжал бы в копейках без всякой причины. У всех четырёх
-- валют ровно два знака после запятой, так что множитель один.
CREATE TYPE "TripCurrency" AS ENUM ('THB', 'RUB', 'BYN', 'USD');

CREATE TYPE "TripExpenseCategory" AS ENUM (
  'FLIGHT',
  'STAY',
  'TICKETS',
  'FOOD',
  'SHOPPING',
  'TRANSPORT',
  'OTHER'
);

CREATE TABLE "TripExpense" (
  "id"          TEXT NOT NULL,
  "tripId"      TEXT NOT NULL,
  -- Чья трата. Ключ ко всему: выборка всегда идёт по паре (поездка, я).
  "userId"      TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency"    "TripCurrency" NOT NULL,
  "category"    "TripExpenseCategory" NOT NULL DEFAULT 'OTHER',
  -- День траты. Без времени: «когда именно в четверг» никому не нужно.
  "spentOn"     TIMESTAMP(3),
  -- Необязательная привязка к брони: перелёты и отели сайт уже знает, и
  -- заставлять вбивать их второй раз было бы странно. SET NULL, а не
  -- CASCADE: удалили бронь — трата осталась, деньги-то потрачены.
  "bookingId"   TEXT,
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TripExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TripExpense_tripId_userId_idx" ON "TripExpense"("tripId", "userId");
CREATE INDEX "TripExpense_bookingId_idx" ON "TripExpense"("bookingId");

ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "TripBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Личный бюджет поездки: по одному на человека и на валюту. Валюта в
-- ключе нарочно — курсов мы не храним и не выдумываем (живой курс тянуть
-- неоткуда, см. docs/features/trips.md), поэтому «потрачено из бюджета»
-- считается внутри одной валюты, а не через пересчёт.
CREATE TABLE "TripBudget" (
  "tripId"      TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "currency"    "TripCurrency" NOT NULL,
  "amountMinor" INTEGER NOT NULL,

  CONSTRAINT "TripBudget_pkey" PRIMARY KEY ("tripId", "userId", "currency")
);

ALTER TABLE "TripBudget" ADD CONSTRAINT "TripBudget_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripBudget" ADD CONSTRAINT "TripBudget_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

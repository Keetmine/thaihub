-- Несколько дней у записи поездки (правка владельца 2026-09-15: «в
-- событиях поездки тоже добавим возможность добавлять несколько дней»).
--
-- Устроено как EventOccurrence у каталожного события: запись одна —
-- одно название, одна картинка, одни артисты, одна отметка «я там
-- буду», — а дней у неё несколько.
--
-- TripPersonalEvent.startsAt ОСТАЁТСЯ и хранит ПЕРВЫЙ день: туда
-- смотрит всё, что знает про одну дату (блок «Вы идёте» на главной,
-- «видела вживую», сортировки). Переучивать эти места ради
-- многодневных записей значило бы трогать половину проекта.
CREATE TABLE "TripPersonalEventDate" (
  "id"              TEXT NOT NULL,
  "personalEventId" TEXT NOT NULL,
  "startsAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TripPersonalEventDate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TripPersonalEventDate_personalEventId_fkey"
    FOREIGN KEY ("personalEventId") REFERENCES "TripPersonalEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TripPersonalEventDate_personalEventId_idx"
  ON "TripPersonalEventDate"("personalEventId");

-- Перенос: у каждой существующей записи ровно один день — её startsAt.
-- Без этого лента поездки перестала бы показывать уже заведённое.
INSERT INTO "TripPersonalEventDate" ("id", "personalEventId", "startsAt")
SELECT md5(random()::text || clock_timestamp()::text), "id", "startsAt"
FROM "TripPersonalEvent";

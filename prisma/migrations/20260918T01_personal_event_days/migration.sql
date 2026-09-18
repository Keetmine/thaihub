-- Дни личного события поездки (правка владельца 2026-09-18: «на личные
-- даты тоже добавим возможность добавлять несколько дней и на каждый
-- день свой актёрский состав»).
--
-- Раньше у записи была одна дата (TripPersonalEvent.startsAt) и один
-- список артистов (TripPersonalEventPerformer). Теперь дней несколько,
-- у каждого свои дата, время и состав. startsAt у записи остаётся —
-- это первый день, по нему сортировка, блок «Вы идёте» на главной и
-- дата траты в расходах; экшены держат его в синхроне.
--
-- Перенос: каждой существующей записи — один день с её датой, состав
-- переезжает в состав этого дня, старая таблица уходит.

CREATE TABLE "TripPersonalEventDay" (
  "id"              TEXT NOT NULL,
  "personalEventId" TEXT NOT NULL,
  "startsAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TripPersonalEventDay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TripPersonalEventDay_personalEventId_idx" ON "TripPersonalEventDay"("personalEventId");

ALTER TABLE "TripPersonalEventDay" ADD CONSTRAINT "TripPersonalEventDay_personalEventId_fkey"
  FOREIGN KEY ("personalEventId") REFERENCES "TripPersonalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TripPersonalEventDayPerformer" (
  "id"          TEXT NOT NULL,
  "dayId"       TEXT NOT NULL,
  "performerId" TEXT NOT NULL,

  CONSTRAINT "TripPersonalEventDayPerformer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TripPersonalEventDayPerformer_dayId_performerId_key"
  ON "TripPersonalEventDayPerformer"("dayId", "performerId");
CREATE INDEX "TripPersonalEventDayPerformer_performerId_idx" ON "TripPersonalEventDayPerformer"("performerId");

ALTER TABLE "TripPersonalEventDayPerformer" ADD CONSTRAINT "TripPersonalEventDayPerformer_dayId_fkey"
  FOREIGN KEY ("dayId") REFERENCES "TripPersonalEventDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripPersonalEventDayPerformer" ADD CONSTRAINT "TripPersonalEventDayPerformer_performerId_fkey"
  FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос: id дня — детерминированный от id записи, чтобы состав
-- перевязать одним INSERT … SELECT без временных таблиц.
INSERT INTO "TripPersonalEventDay" ("id", "personalEventId", "startsAt")
SELECT 'day_' || "id", "id", "startsAt" FROM "TripPersonalEvent";

INSERT INTO "TripPersonalEventDayPerformer" ("id", "dayId", "performerId")
SELECT 'dp_' || "id", 'day_' || "personalEventId", "performerId" FROM "TripPersonalEventPerformer";

DROP TABLE "TripPersonalEventPerformer";

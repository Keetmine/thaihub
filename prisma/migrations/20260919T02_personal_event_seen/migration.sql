-- Кого видел(а) на личном событии поездки — СВОЯ отметка у каждого
-- участника (правка владельца 2026-09-19): «мы ходили в клуб и видели
-- там актёра, девочки тоже были с нами, но этого актёра не видели, а
-- увидели другого; сейчас нужно два одинаковых события — давай как на
-- обычных событиях: выбор, кого видел, + возможность добавлять артистов;
-- если его кто-то добавил, у других он автоматически не отмечен».
--
-- До этого «видела вживую» из личных событий считалось как
-- «я там буду» × весь состав дня. Теперь факт лежит здесь строкой на
-- человека, день и артиста; состав дня (TripPersonalEventDayPerformer)
-- остаётся общим списком «кто был на событии».
--
-- Бэкфилл повторяет прежнее правило: отметившимся «я там буду» — весь
-- состав каждого дня, чтобы уже посчитанное «вживую» не откатилось.
CREATE TABLE "TripPersonalEventSeen" (
    "userId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripPersonalEventSeen_pkey" PRIMARY KEY ("userId", "dayId", "performerId")
);

CREATE INDEX "TripPersonalEventSeen_dayId_idx" ON "TripPersonalEventSeen"("dayId");
CREATE INDEX "TripPersonalEventSeen_performerId_idx" ON "TripPersonalEventSeen"("performerId");

ALTER TABLE "TripPersonalEventSeen" ADD CONSTRAINT "TripPersonalEventSeen_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripPersonalEventSeen" ADD CONSTRAINT "TripPersonalEventSeen_dayId_fkey"
    FOREIGN KEY ("dayId") REFERENCES "TripPersonalEventDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripPersonalEventSeen" ADD CONSTRAINT "TripPersonalEventSeen_performerId_fkey"
    FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TripPersonalEventSeen" ("userId", "dayId", "performerId")
SELECT a."userId", d."id", dp."performerId"
FROM "TripPersonalEventAttendance" a
JOIN "TripPersonalEventDay" d ON d."personalEventId" = a."personalEventId"
JOIN "TripPersonalEventDayPerformer" dp ON dp."dayId" = d."id"
ON CONFLICT DO NOTHING;

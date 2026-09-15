-- «Видела вживую» привязывается к событию (правка владельца 2026-09-15).
--
-- Раньше спор с автоматикой жил одной строкой на артиста
-- (PerformerSeen.seen=false — «не видела, хотя была в составе»). Снять
-- Jeff Satur с одного фестиваля значило снять его со всех шести
-- концертов: в статистике вместо 5 получалось 0. Теперь решение
-- хранится у события — EventSeenPerformer, — и снятие на фестивале не
-- трогает остальные.
--
-- PerformerSeen остаётся только для «видели вне нашей афиши»
-- (концерт до регистрации, встреча без события у нас): колонка seen
-- уходит, все оставшиеся строки — это «да».
CREATE TABLE "EventSeenPerformer" (
  "userId"      TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "performerId" TEXT NOT NULL,
  "seen"        BOOLEAN NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventSeenPerformer_pkey" PRIMARY KEY ("userId", "eventId", "performerId"),
  CONSTRAINT "EventSeenPerformer_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventSeenPerformer_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventSeenPerformer_performerId_fkey"
    FOREIGN KEY ("performerId") REFERENCES "Performer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventSeenPerformer_eventId_idx" ON "EventSeenPerformer"("eventId");
CREATE INDEX "EventSeenPerformer_performerId_idx" ON "EventSeenPerformer"("performerId");

-- Перенос старых «не видела»: на каждое ПОСЕЩЁННОЕ афишное событие, где
-- артист был в составе дня (или в общем составе, если у дня своего
-- нет), — явная строка seen=false. Ничего не теряем: у обычного
-- концерта это по-прежнему «снят», а у дня с лайнапом совпадает с новым
-- умолчанием и просто лежит без дела.
INSERT INTO "EventSeenPerformer" ("userId", "eventId", "performerId", "seen")
SELECT DISTINCT ps."userId", ea."eventId", ps."performerId", false
FROM "PerformerSeen" ps
JOIN "EventAttendance" ea ON ea."userId" = ps."userId"
JOIN "EventOccurrence" eo ON eo."id" = ea."occurrenceId"
JOIN "Event" e ON e."id" = ea."eventId" AND e."communityId" IS NULL
WHERE ps."seen" = false
  AND (
    EXISTS (
      SELECT 1 FROM "OccurrenceLineup" ol
      WHERE ol."occurrenceId" = eo."id" AND ol."performerId" = ps."performerId"
    )
    OR (
      NOT EXISTS (SELECT 1 FROM "OccurrenceLineup" ol WHERE ol."occurrenceId" = eo."id")
      AND EXISTS (
        SELECT 1 FROM "EventPerformer" ep
        WHERE ep."eventId" = ea."eventId" AND ep."performerId" = ps."performerId"
      )
    )
  )
ON CONFLICT DO NOTHING;

-- И обратный перенос: у дня фестиваля СО СВОИМ лайнапом новое умолчание
-- «не видела никого», а старое было «видела всех». Всё, что человек
-- НЕ снимал, значит, видел — записываем это явно, иначе галочки просто
-- пропали бы. У дней без лайнапа умолчание не поменялось («видела
-- всех»), там записывать нечего.
INSERT INTO "EventSeenPerformer" ("userId", "eventId", "performerId", "seen")
SELECT DISTINCT ea."userId", ea."eventId", ol."performerId", true
FROM "EventAttendance" ea
JOIN "EventOccurrence" eo ON eo."id" = ea."occurrenceId"
JOIN "Event" e ON e."id" = ea."eventId" AND e."communityId" IS NULL
JOIN "OccurrenceLineup" ol ON ol."occurrenceId" = eo."id"
WHERE eo."startsAt" < NOW()
ON CONFLICT DO NOTHING;

DELETE FROM "PerformerSeen" WHERE "seen" = false;
ALTER TABLE "PerformerSeen" DROP COLUMN "seen";

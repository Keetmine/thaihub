-- «Возможно пойду» — кандидат на дату (правка владельца 2026-09-15):
-- между сердечком («интересно вообще») и «иду» («решено»). Нужно, чтобы
-- видеть свои варианты в расписании поездки: в один вечер два концерта,
-- оба интересны, пойду на один.
--
-- Отдельной таблицей, а не статусом у EventAttendance: отметки «иду»
-- читаются в трёх десятках мест (статистика, ачивки, «видела вживую»,
-- уведомления друзьям, ICS), и любое пропущенное превратило бы
-- «может быть» в посещённое событие.
CREATE TABLE "EventMaybe" (
  "userId"       TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "eventId"      TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventMaybe_pkey" PRIMARY KEY ("userId", "occurrenceId"),
  CONSTRAINT "EventMaybe_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventMaybe_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "EventOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventMaybe_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EventMaybe_eventId_idx" ON "EventMaybe"("eventId");
CREATE INDEX "EventMaybe_occurrenceId_idx" ON "EventMaybe"("occurrenceId");

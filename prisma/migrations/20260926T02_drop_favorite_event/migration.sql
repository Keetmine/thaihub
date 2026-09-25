-- Избранное на событиях убрано (просьба владельца 2026-09-26): его роль
-- закрывают «иду» (EventAttendance) и «возможно пойду» (EventMaybe).
-- Чтобы отметки людей не пропали, избранное с БУДУЩИМИ датами
-- конвертируется в «возможно пойду» на ближайшую будущую дату события —
-- если человек уже не отметил там «иду» или «возможно». Избранное на
-- прошедших событиях в конвертации не участвует: показать его больше негде.
INSERT INTO "EventMaybe" ("userId", "occurrenceId", "eventId", "createdAt")
SELECT f."userId", o.id, f."eventId", f."createdAt"
FROM "FavoriteEvent" f
JOIN LATERAL (
  SELECT oo.id FROM "EventOccurrence" oo
  WHERE oo."eventId" = f."eventId" AND oo."startsAt" >= now()
  ORDER BY oo."startsAt" ASC
  LIMIT 1
) o ON true
WHERE NOT EXISTS (
    SELECT 1 FROM "EventAttendance" a
    WHERE a."userId" = f."userId" AND a."eventId" = f."eventId"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "EventMaybe" m
    WHERE m."userId" = f."userId" AND m."eventId" = f."eventId"
  )
ON CONFLICT DO NOTHING;

DROP TABLE "FavoriteEvent";

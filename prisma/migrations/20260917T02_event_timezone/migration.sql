-- Таймзона у события и у сообщества (правка владельца 2026-09-17).
--
-- Даты событий лежат «настенным временем» в UTC-полях, и до сих пор это
-- всегда были тайские часы. Встреча сообщества в Беларуси при этом
-- показывалась как «22:10 (МСК 18:10)» — время, введённое по Минску,
-- сайт считал тайским. Теперь у события своя зона (каталог — Бангкок,
-- умолчание), а у сообщества — зона, в которой вводятся его встречи.
--
-- Бэкфил: сообществу — зона владельца (у User она есть всегда, дефолт
-- Europe/Moscow), уже созданным встречам — зона их сообщества. Уже
-- введённое время при этом НЕ пересчитывается: оно и вводилось по
-- местным часам, менять надо было только подпись.
ALTER TABLE "Event" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok';
ALTER TABLE "Community" ADD COLUMN "timezone" TEXT;

UPDATE "Community" c SET "timezone" = u."timezone"
FROM "User" u WHERE u."id" = c."ownerId";

UPDATE "Event" e SET "timezone" = c."timezone"
FROM "Community" c WHERE e."communityId" = c."id" AND c."timezone" IS NOT NULL;

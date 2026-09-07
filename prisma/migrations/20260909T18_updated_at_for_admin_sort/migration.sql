-- Отметка последней правки для пейрингов, достижений и сообществ.
--
-- В админке появился общий порядок «по обновлению» (см. src/lib/adminSort.ts):
-- владелец правит каталог и хочет видеть, что трогал последним. У этих трёх
-- таблиц была только дата создания, и порядок по ней отвечал на другой вопрос.
--
-- Существующим строкам ставим updatedAt = createdAt, а не «сейчас»: иначе весь
-- каталог одинаково выглядел бы только что отредактированным, и первый же
-- список по обновлению оказался бы бессмысленным.
--
-- У User колонки нет намеренно: там пишется lastSeenAt на каждом заходе, и
-- «по обновлению» слилось бы с уже существующим «по последнему заходу».

ALTER TABLE "Pairing" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Pairing" SET "updatedAt" = "createdAt";

ALTER TABLE "Achievement" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Achievement" SET "updatedAt" = "createdAt";

ALTER TABLE "Community" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Community" SET "updatedAt" = "createdAt";

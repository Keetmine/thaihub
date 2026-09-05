-- Источник записи новеллы: адрес страницы на ficbook.net (по образцу
-- Drama.doramalandUrl). Показывается в блоке «Источники» на странице
-- новеллы.
ALTER TABLE "Novel" ADD COLUMN "ficbookUrl" TEXT;

-- Дозаполнение: до этого поля импорт с Фикбука клал адрес только в
-- свободные ссылки «где почитать» (NovelLink «Фикбук»). Берём по одной
-- ссылке на новеллу и пропускаем адреса, которые встретились бы дважды,
-- чтобы не упереться в уникальность.
UPDATE "Novel" n
SET "ficbookUrl" = picked.url
FROM (
  SELECT DISTINCT ON (l."novelId") l."novelId", l.url
  FROM "NovelLink" l
  WHERE l.url ~ '^https?://(www\.)?ficbook\.net/'
  ORDER BY l."novelId", l.id
) picked
WHERE picked."novelId" = n.id
  AND NOT EXISTS (
    SELECT 1 FROM "NovelLink" o
    WHERE o.url = picked.url AND o."novelId" <> picked."novelId"
  );

CREATE UNIQUE INDEX "Novel_ficbookUrl_key" ON "Novel"("ficbookUrl");
